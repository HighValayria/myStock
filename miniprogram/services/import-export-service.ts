import { SCHEMA_VERSION } from '../config/collections';
import type { AddStockInput, Batch, Category, Item, Location, Reminder, RestockItem, Settings, Transaction } from '../models';
import type { InventoryRepositories } from '../repositories';
import { dateOnlyToUtcMs, getEffectiveExpiryDate, getRemainingDays, toDateOnly } from '../utils/date';
import { InventoryError } from '../utils/errors';
import { createId } from '../utils/id';
import { DEFAULT_UNIT, UNKNOWN_EXPIRY_DATE, calculateExpiryDateFromShelfLife, normalizeDateInput, parseOptionalNumber, parsePositiveNumber, resolveExpiryDate } from '../utils/phase2-form';
import { InventoryService } from './inventory-service';
import { ReminderService } from './reminder-service';

export const BACKUP_APP_VERSION = '0.1';
export const EXCEL_TEMPLATE_HEADERS = [
  '物品名称',
  '类别',
  '品牌',
  '规格',
  '数量',
  '单位',
  '存放位置',
  '购买日期',
  '生产日期',
  '保质期数值',
  '保质期单位',
  '到期日期',
  '单位购买价格',
  '购买渠道',
  '低库存阈值',
  '临期阈值',
  '备注',
] as const;

export interface ImportExportOptions {
  userId: string;
  now?: () => Date;
}

export interface ExcelImportRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ExcelImportError {
  rowNumber: number;
  message: string;
}

export interface ParsedExcelImportRow {
  rowNumber: number;
  itemKey: string;
  itemId?: string;
  item: AddStockInput['item'];
  quantity: number;
  locationId?: string;
  categoryName: string;
  locationName: string;
  purchaseDate: string | null;
  productionDate: string | null;
  shelfLifeValue: number | null;
  shelfLifeUnit: AddStockInput['shelfLifeUnit'];
  expiryDate: string;
  purchasePrice: number | null;
  purchaseChannel: string | null;
  note: string;
}

export interface ExcelImportPreview {
  importOperationId: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ExcelImportError[];
  unknownFields: string[];
  rows: ParsedExcelImportRow[];
  creates: {
    itemCount: number;
    batchCount: number;
    categoryNames: string[];
    locationNames: string[];
  };
}

export interface ExcelImportResult {
  importOperationId: string;
  successRows: number;
  skippedRows: number;
  failedRows: ExcelImportError[];
  createdItems: number;
  addedBatches: number;
  mergedBatches: number;
}

export interface BackupData {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  categories: Category[];
  items: Item[];
  batches: Batch[];
  transactions: Transaction[];
  locations: Location[];
  reminders: Reminder[];
  restockItems: RestockItem[];
  settings: Settings | null;
}

export interface BackupValidationResult {
  valid: boolean;
  errors: string[];
  summary: {
    categories: number;
    items: number;
    batches: number;
    transactions: number;
    locations: number;
    reminders: number;
    restockItems: number;
    hasSettings: boolean;
  };
}

const FIELD_ALIASES: Record<string, string> = {
  名称: '物品名称',
  库存数量: '数量',
  单价: '单位购买价格',
  购买价格: '单位购买价格',
  位置: '存放位置',
};

function normalizeHeader(value: string): string {
  const header = value.trim();
  return FIELD_ALIASES[header] || header;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function splitTableLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  const output: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      output.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  output.push(current.trim());
  return output;
}

export function parseStandardExcelText(text: string): { rows: ExcelImportRow[]; unknownFields: string[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: [], unknownFields: [] };
  const headers = splitTableLine(lines[0]).map(normalizeHeader);
  const known = new Set(EXCEL_TEMPLATE_HEADERS as readonly string[]);
  const unknownFields = headers.filter((header) => !known.has(header));
  const rows = lines.slice(1).map((line, index) => {
    const cells = splitTableLine(line);
    const values: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      if (known.has(header)) values[header] = cells[cellIndex] || '';
    });
    return { rowNumber: index + 2, values };
  });
  return { rows, unknownFields };
}

function itemKey(input: { name: string; specification?: string | null; brand?: string | null; unit: string }): string {
  return [input.name, input.specification || '', input.brand || '', input.unit].map((part) => part.trim().toLowerCase()).join('|');
}

function shelfLifeUnit(value: string): AddStockInput['shelfLifeUnit'] {
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'DAY' || raw === '天') return 'DAY';
  if (raw === 'MONTH' || raw === '月' || raw === '个月') return 'MONTH';
  if (raw === 'YEAR' || raw === '年') return 'YEAR';
  throw new InventoryError('VALIDATION_ERROR', '保质期单位不合法');
}

function assertNoDateConflict(row: ExcelImportRow, productionDate: string | null, shelfLifeValue: number | null, unit: AddStockInput['shelfLifeUnit'], expiryDate: string): void {
  if (!productionDate || shelfLifeValue == null || !unit || expiryDate === UNKNOWN_EXPIRY_DATE) return;
  const calculated = calculateExpiryDateFromShelfLife({ productionDate, shelfLifeValue, shelfLifeUnit: unit });
  if (calculated && calculated !== expiryDate) {
    throw new InventoryError('VALIDATION_ERROR', `第${row.rowNumber}行：生产日期 + 保质期与到期日期冲突`);
  }
}

function priceLabel(): string {
  return '单位购买价格';
}

export class ImportExportService {
  private readonly now: () => Date;

  constructor(private readonly repos: InventoryRepositories, private readonly options: ImportExportOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async previewExcelImport(input: { text: string; importOperationId?: string }): Promise<ExcelImportPreview> {
    const parsed = parseStandardExcelText(input.text);
    return this.previewExcelRows({ ...input, rows: parsed.rows, unknownFields: parsed.unknownFields });
  }

  async previewExcelRows(input: { rows: ExcelImportRow[]; unknownFields?: string[]; importOperationId?: string }): Promise<ExcelImportPreview> {
    const [items, categories, locations] = await Promise.all([
      this.repos.items.listByUser(this.options.userId),
      this.repos.categories.listByUser(this.options.userId),
      this.repos.locations.listByUser(this.options.userId),
    ]);
    const itemByKey = new Map(items.map((item) => [itemKey(item), item]));
    const categoryNames = new Set(categories.map((category) => category.name.trim().toLowerCase()));
    const locationNames = new Set(locations.map((location) => location.name.trim().toLowerCase()));
    const parsedRows: ParsedExcelImportRow[] = [];
    const errors: ExcelImportError[] = [];
    const newCategoryNames = new Set<string>();
    const newLocationNames = new Set<string>();
    const newItemKeys = new Set<string>();

    for (const row of input.rows) {
      try {
        const values = row.values;
        const name = normalizeText(values['物品名称']);
        if (!name) throw new InventoryError('VALIDATION_ERROR', '物品名称必填');
        const quantity = parsePositiveNumber(values['数量'], '数量');
        const unit = normalizeText(values['单位']) || DEFAULT_UNIT;
        const categoryName = normalizeText(values['类别']) || '其他';
        const locationName = normalizeText(values['存放位置']) || '默认位置';
        const brand = normalizeText(values['品牌']);
        const specification = normalizeText(values['规格']);
        const purchaseDate = normalizeDateInput(values['购买日期'], '购买日期');
        const productionDate = normalizeDateInput(values['生产日期'], '生产日期');
        const shelfLifeValue = parseOptionalNumber(values['保质期数值'], '保质期数值', { integer: true, min: 1 });
        const shelfLifeUnitValue = shelfLifeUnit(values['保质期单位'] || '');
        const expiryDate = resolveExpiryDate({
          expiryDate: values['到期日期'],
          productionDate,
          shelfLifeValue,
          shelfLifeUnit: shelfLifeValue == null ? null : shelfLifeUnitValue,
          allowUnknown: true,
        });
        assertNoDateConflict(row, productionDate, shelfLifeValue, shelfLifeValue == null ? null : shelfLifeUnitValue, expiryDate);
        const purchasePrice = parseOptionalNumber(values['单位购买价格'], priceLabel(), { min: 0 });
        const lowStockThreshold = parseOptionalNumber(values['低库存阈值'], '低库存阈值', { min: 0 });
        const expiryWarningDays = parseOptionalNumber(values['临期阈值'], '临期阈值', { integer: true, min: 0 });
        const key = itemKey({ name, brand, specification, unit });
        const existingItem = itemByKey.get(key);
        if (!existingItem) newItemKeys.add(key);
        if (!categoryNames.has(categoryName.toLowerCase())) newCategoryNames.add(categoryName);
        if (!locationNames.has(locationName.toLowerCase())) newLocationNames.add(locationName);
        parsedRows.push({
          rowNumber: row.rowNumber,
          itemKey: key,
          itemId: existingItem?._id,
          item: existingItem
            ? undefined
            : {
                name,
                categoryId: '',
                brand: brand || null,
                specification: specification || null,
                unit,
                defaultLocationId: '',
                lowStockThreshold,
                expiryWarningDays,
                note: normalizeText(values['备注']),
              },
          quantity,
          categoryName,
          locationName,
          purchaseDate,
          productionDate,
          shelfLifeValue,
          shelfLifeUnit: shelfLifeValue == null ? null : shelfLifeUnitValue,
          expiryDate,
          purchasePrice,
          purchaseChannel: normalizeText(values['购买渠道']) || null,
          note: normalizeText(values['备注']),
        });
      } catch (error) {
        errors.push({ rowNumber: row.rowNumber, message: error instanceof Error ? error.message : String(error) });
      }
    }

    return {
      importOperationId: input.importOperationId || `excel_${this.now().getTime().toString(36)}`,
      totalRows: input.rows.length,
      validRows: parsedRows.length,
      errorRows: errors.length,
      errors,
      unknownFields: input.unknownFields || [],
      rows: parsedRows,
      creates: {
        itemCount: newItemKeys.size,
        batchCount: parsedRows.length,
        categoryNames: [...newCategoryNames],
        locationNames: [...newLocationNames],
      },
    };
  }

  async commitExcelImport(preview: ExcelImportPreview): Promise<ExcelImportResult> {
    if (preview.errors.length > 0) throw new InventoryError('VALIDATION_ERROR', '存在错误行，请修正后再导入');
    const inventory = new InventoryService(
      this.repos,
      { userId: this.options.userId, defaultExpiryWarningDays: 7, now: this.now },
      new ReminderService(this.repos, { userId: this.options.userId, defaultExpiryWarningDays: 7, now: this.now }),
    );
    let createdItems = 0;
    let addedBatches = 0;
    let mergedBatches = 0;
    let skippedRows = 0;
    const failedRows: ExcelImportError[] = [];
    for (const row of preview.rows) {
      try {
        const category = await this.ensureCategory(row.categoryName);
        const location = await this.ensureLocation(row.locationName);
        const result = await inventory.addStock({
          itemId: row.itemId,
          item: row.item ? { ...row.item, categoryId: category._id, defaultLocationId: location._id } : undefined,
          quantity: row.quantity,
          locationId: location._id,
          purchaseDate: row.purchaseDate,
          productionDate: row.productionDate,
          shelfLifeValue: row.shelfLifeValue,
          shelfLifeUnit: row.shelfLifeUnit,
          expiryDate: row.expiryDate,
          purchasePrice: row.purchasePrice,
          purchaseChannel: row.purchaseChannel,
          note: row.note ? `${row.note}；来源：Excel导入` : '来源：Excel导入',
          operationId: `${preview.importOperationId}:row:${row.rowNumber}`,
        });
        if ((result as { idempotent?: boolean }).idempotent) skippedRows += 1;
        else {
          if (!row.itemId) createdItems += 1;
          if (result.merged) mergedBatches += 1;
          else addedBatches += 1;
        }
      } catch (error) {
        if ((error as { code?: string }).code === 'DUPLICATE_OPERATION') skippedRows += 1;
        else failedRows.push({ rowNumber: row.rowNumber, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return {
      importOperationId: preview.importOperationId,
      successRows: preview.rows.length - skippedRows - failedRows.length,
      skippedRows,
      failedRows,
      createdItems,
      addedBatches,
      mergedBatches,
    };
  }

  async exportBackup(): Promise<BackupData> {
    const [categories, items, batches, transactions, locations, reminders, restocks, settings] = await Promise.all([
      this.repos.categories.listByUser(this.options.userId),
      this.repos.items.listByUser(this.options.userId),
      this.repos.batches.listByUser(this.options.userId),
      this.repos.transactions.listByUser(this.options.userId),
      this.repos.locations.listByUser(this.options.userId),
      this.repos.reminders.listByUser(this.options.userId),
      this.repos.restockItems.listByUser(this.options.userId),
      this.repos.settings.getByUser(this.options.userId),
    ]);
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: BACKUP_APP_VERSION,
      exportedAt: this.now().toISOString(),
      categories,
      items,
      batches,
      transactions,
      locations,
      reminders,
      restockItems: restocks,
      settings,
    };
  }

  validateBackup(data: unknown): BackupValidationResult {
    const backup = data as Partial<BackupData>;
    const errors: string[] = [];
    if (!backup || typeof backup !== 'object') errors.push('备份文件不是有效对象');
    if (backup.schemaVersion == null) errors.push('缺少 schemaVersion');
    else if (backup.schemaVersion > SCHEMA_VERSION) errors.push('该备份来自更新版本的有备录，当前版本无法安全恢复。');
    else if (backup.schemaVersion !== SCHEMA_VERSION) errors.push('缺少可用的备份迁移路径');
    for (const field of ['categories', 'items', 'batches', 'transactions', 'locations', 'reminders', 'restockItems'] as const) {
      if (!Array.isArray(backup[field])) errors.push(`${field} 必须是数组`);
    }
    const itemRows = Array.isArray(backup.items) ? backup.items : [];
    const batchRows = Array.isArray(backup.batches) ? backup.batches : [];
    const categoryRows = Array.isArray(backup.categories) ? backup.categories : [];
    const locationRows = Array.isArray(backup.locations) ? backup.locations : [];
    const transactionRows = Array.isArray(backup.transactions) ? backup.transactions : [];
    const items = new Set(itemRows.map((item) => item._id));
    const batches = new Set(batchRows.map((batch) => batch._id));
    const categories = new Set(categoryRows.map((category) => category._id));
    const locations = new Set(locationRows.map((location) => location._id));
    for (const item of itemRows) if (item.categoryId && !categories.has(item.categoryId)) errors.push(`Item 引用不存在的 Category: ${item._id}`);
    for (const batch of batchRows) {
      if (!items.has(batch.itemId)) errors.push(`Batch 引用不存在的 Item: ${batch._id}`);
      if (batch.locationId && !locations.has(batch.locationId)) errors.push(`Batch 引用不存在的 Location: ${batch._id}`);
    }
    for (const tx of transactionRows) {
      if (!items.has(tx.itemId)) errors.push(`Transaction 引用不存在的 Item: ${tx._id}`);
      if (!batches.has(tx.batchId)) errors.push(`Transaction 引用不存在的 Batch: ${tx._id}`);
    }
    return {
      valid: errors.length === 0,
      errors,
      summary: {
        categories: backup.categories?.length || 0,
        items: backup.items?.length || 0,
        batches: backup.batches?.length || 0,
        transactions: backup.transactions?.length || 0,
        locations: backup.locations?.length || 0,
        reminders: backup.reminders?.length || 0,
        restockItems: backup.restockItems?.length || 0,
        hasSettings: Boolean(backup.settings),
      },
    };
  }

  migrateBackup(data: BackupData): BackupData {
    if (data.schemaVersion !== SCHEMA_VERSION) {
      throw new InventoryError('VALIDATION_ERROR', '当前没有可用的备份迁移路径');
    }
    return data;
  }

  async restoreBackup(data: BackupData): Promise<BackupValidationResult> {
    const validation = this.validateBackup(data);
    if (!validation.valid) throw new InventoryError('VALIDATION_ERROR', validation.errors.join('；'));
    const backup = this.migrateBackup(data);
    const run = async (repos: InventoryRepositories) => {
      const [transactions, reminders, restocks, batches, items, categories, locations] = await Promise.all([
        repos.transactions.listByUser(this.options.userId),
        repos.reminders.listByUser(this.options.userId),
        repos.restockItems.listByUser(this.options.userId),
        repos.batches.listByUser(this.options.userId),
        repos.items.listByUser(this.options.userId),
        repos.categories.listByUser(this.options.userId),
        repos.locations.listByUser(this.options.userId),
      ]);
      for (const transaction of transactions) await repos.transactions.delete(this.options.userId, transaction._id);
      for (const reminder of reminders) await repos.reminders.delete(this.options.userId, reminder._id);
      for (const restock of restocks) await repos.restockItems.delete(this.options.userId, restock._id);
      for (const batch of batches) await repos.batches.delete(this.options.userId, batch._id);
      for (const item of items) await repos.items.delete(this.options.userId, item._id);
      for (const category of categories) await repos.categories.delete(this.options.userId, category._id);
      for (const location of locations) await repos.locations.delete(this.options.userId, location._id);
      await repos.settings.deleteForUser(this.options.userId);
      for (const category of backup.categories) await repos.categories.create({ ...category, _openid: this.options.userId });
      for (const location of backup.locations) await repos.locations.create({ ...location, _openid: this.options.userId });
      for (const item of backup.items) await repos.items.create({ ...item, _openid: this.options.userId });
      for (const batch of backup.batches) await repos.batches.create({ ...batch, _openid: this.options.userId });
      for (const transaction of backup.transactions) await repos.transactions.create({ ...transaction, _openid: this.options.userId });
      for (const reminder of backup.reminders) await repos.reminders.create({ ...reminder, _openid: this.options.userId });
      for (const restock of backup.restockItems) await repos.restockItems.create({ ...restock, _openid: this.options.userId });
      if (backup.settings) await repos.settings.upsertForUser({ ...backup.settings, _openid: this.options.userId });
    };
    if (this.repos.runInTransaction) await this.repos.runInTransaction(run);
    else await run(this.repos);
    return validation;
  }

  exportExcelText(rows: Array<Record<string, unknown>>): string {
    const output = [EXCEL_TEMPLATE_HEADERS.join('\t')];
    for (const row of rows) output.push(EXCEL_TEMPLATE_HEADERS.map((header) => normalizeText(row[header])).join('\t'));
    return output.join('\n');
  }

  private async ensureCategory(name: string): Promise<Category> {
    const categories = await this.repos.categories.listByUser(this.options.userId);
    const existing = categories.find((category) => category.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const timestamp = this.now().getTime();
    return this.repos.categories.create({ _id: createId('cat'), _openid: this.options.userId, schemaVersion: SCHEMA_VERSION, name, icon: null, expiryWarningDays: null, defaultLowStock: null, createdAt: timestamp, updatedAt: timestamp });
  }

  private async ensureLocation(name: string): Promise<Location> {
    const locations = await this.repos.locations.listByUser(this.options.userId);
    const existing = locations.find((location) => location.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const timestamp = this.now().getTime();
    return this.repos.locations.create({ _id: createId('loc'), _openid: this.options.userId, schemaVersion: SCHEMA_VERSION, name, parentId: null, createdAt: timestamp, updatedAt: timestamp });
  }
}
