import { SCHEMA_VERSION } from '../config/collections';
import type {
  AddStockInput,
  AddStockResult,
  AdjustStockInput,
  AdjustStockResult,
  Batch,
  ConsumeStockInput,
  ConsumeStockResult,
  CreateItemInput,
  DeleteItemOptions,
  InventoryListItem,
  InventoryQuery,
  Item,
  ItemDetail,
  Transaction,
  UpdateBatchInput,
  UpdateItemInput,
} from '../models';
import type { InventoryRepositories } from '../repositories';
import { compareByEffectiveExpiryDate, getEffectiveExpiryDate, getRemainingDays } from '../utils/date';
import { InventoryError } from '../utils/errors';
import { createId, createOperationId } from '../utils/id';
import { assertNonEmptyString, assertNonNegativeNumber, assertPositiveNumber } from '../utils/validation';
import { ReminderService } from './reminder-service';

export interface InventoryServiceOptions {
  userId: string;
  now?: () => Date;
  defaultExpiryWarningDays?: number;
  disableTransactions?: boolean;
}

export class InventoryService {
  private readonly now: () => Date;
  private readonly reminderService: ReminderService;

  constructor(private readonly repos: InventoryRepositories, private readonly options: InventoryServiceOptions, reminderService?: ReminderService) {
    this.now = options.now ?? (() => new Date());
    this.reminderService = reminderService ?? new ReminderService(repos, options);
  }

  async createItem(input: CreateItemInput): Promise<Item> {
    this.validateCreateItem(input);
    const now = this.now().getTime();
    const item: Item = {
      _id: createId('item'),
      _openid: this.options.userId,
      schemaVersion: SCHEMA_VERSION,
      name: input.name.trim(),
      categoryId: input.categoryId,
      brand: input.brand ?? null,
      specification: input.specification ?? null,
      unit: input.unit.trim(),
      defaultLocationId: input.defaultLocationId ?? null,
      lowStockThreshold: input.lowStockThreshold ?? null,
      expiryWarningDays: input.expiryWarningDays ?? null,
      barcode: input.barcode ?? null,
      note: input.note ?? '',
      createdAt: now,
      updatedAt: now,
    };
    return this.repos.items.create(item);
  }

  async addStock(input: AddStockInput): Promise<AddStockResult> {
    return this.withWriteBoundary((service) => service.addStockCore(input));
  }

  async consumeStock(input: ConsumeStockInput): Promise<ConsumeStockResult> {
    return this.withWriteBoundary((service) => service.consumeStockCore(input));
  }

  async adjustStock(input: AdjustStockInput): Promise<AdjustStockResult> {
    return this.withWriteBoundary((service) => service.adjustStockCore(input));
  }

  async updateItem(itemId: string, patch: UpdateItemInput): Promise<Item> {
    await this.requireItem(itemId);
    return this.repos.items.update(this.options.userId, itemId, { ...patch, updatedAt: this.now().getTime() });
  }

  async updateBatch(batchId: string, patch: UpdateBatchInput): Promise<Batch> {
    return this.withWriteBoundary(async (service) => {
      const batch = await service.requireBatch(batchId);
      const updated = await service.repos.batches.update(service.options.userId, batchId, { ...patch, updatedAt: service.now().getTime() });
      await service.reminderService.recomputeReminders({ itemId: batch.itemId });
      return updated;
    });
  }

  async deleteItem(itemId: string, options: DeleteItemOptions): Promise<void> {
    return this.withWriteBoundary(async (service) => {
      await service.requireItem(itemId);
      if (!options.confirmEmptyItem) throw new InventoryError('DELETE_NOT_ALLOWED', 'Deleting an item requires confirmation');
      const batches = await service.repos.batches.listByItem(service.options.userId, itemId);
      if (batches.some((batch) => batch.quantity > 0)) {
        throw new InventoryError('DELETE_NOT_ALLOWED', 'Item still has stock; adjust or discard stock first');
      }
      await service.repos.items.delete(service.options.userId, itemId);
    });
  }

  async getInventory(query: InventoryQuery = {}): Promise<InventoryListItem[]> {
    const items = await this.repos.items.listByUser(this.options.userId);
    const batches = await this.repos.batches.listByUser(this.options.userId);
    const today = this.now();

    const rows = items.map((item) => {
      const itemBatches = batches.filter((batch) => batch.itemId === item._id);
      const positiveBatches = itemBatches.filter((batch) => batch.quantity > 0).sort(compareByEffectiveExpiryDate);
      const totalQuantity = itemBatches.reduce((sum, batch) => sum + batch.quantity, 0);
      const nearest = positiveBatches[0];
      const warningDays = item.expiryWarningDays ?? this.options.defaultExpiryWarningDays ?? 30;
      const expiryStatus = nearest ? this.reminderService.calculateExpiryStatus(nearest, warningDays, today) : 'NORMAL';
      const stockStatus = this.reminderService.calculateStockStatus(totalQuantity, item.lowStockThreshold);
      const nearestExpiryDate = nearest ? getEffectiveExpiryDate(nearest) : null;
      return {
        item,
        totalQuantity,
        nearestExpiryDate,
        nearestRemainingDays: nearestExpiryDate ? getRemainingDays(nearestExpiryDate, today) : null,
        expiryStatus,
        stockStatus,
      };
    });

    return rows.filter((row) => {
      if (query.search && !row.item.name.includes(query.search)) return false;
      if (query.categoryId && row.item.categoryId !== query.categoryId) return false;
      if (query.locationId && row.item.defaultLocationId !== query.locationId) return false;
      if (query.expiryStatus && row.expiryStatus !== query.expiryStatus) return false;
      if (query.stockStatus && row.stockStatus !== query.stockStatus) return false;
      return true;
    });
  }

  async getItemDetail(itemId: string): Promise<ItemDetail> {
    const item = await this.requireItem(itemId);
    const batches = await this.repos.batches.listByItem(this.options.userId, itemId);
    const transactions = await this.repos.transactions.listByItem(this.options.userId, itemId, 20);
    const reminders = await this.repos.reminders.listByItem(this.options.userId, itemId);
    const restockItem = await this.repos.restockItems.findNeededByItem(this.options.userId, itemId);
    const warningDays = item.expiryWarningDays ?? this.options.defaultExpiryWarningDays ?? 30;
    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);

    return {
      item,
      batches: batches.map((batch) => {
        const effectiveExpiryDate = getEffectiveExpiryDate(batch);
        return {
          ...batch,
          remainingDays: getRemainingDays(effectiveExpiryDate, this.now()),
          expiryStatus: this.reminderService.calculateExpiryStatus(batch, warningDays, this.now()),
        };
      }),
      recentTransactions: transactions,
      totalQuantity,
      stockStatus: this.reminderService.calculateStockStatus(totalQuantity, item.lowStockThreshold),
      reminders,
      restockItem,
    };
  }

  private async addStockCore(input: AddStockInput): Promise<AddStockResult> {
    assertPositiveNumber(input.quantity, 'quantity');
    assertNonEmptyString(input.locationId, 'locationId');
    assertNonEmptyString(input.expiryDate, 'expiryDate');
    const operationId = input.operationId ?? createOperationId('add');
    await this.assertOperationIsNew(operationId);

    const item = input.itemId
      ? await this.requireItem(input.itemId)
      : await this.createItem(this.requireNewItem(input));

    const existingBatch = await this.repos.batches.findMergeCandidate(
      this.options.userId,
      item._id,
      input.locationId,
      input.purchaseDate ?? null,
      input.expiryDate,
    );

    const now = this.now().getTime();
    let batch: Batch;
    let merged = false;
    if (existingBatch) {
      merged = true;
      batch = await this.repos.batches.update(this.options.userId, existingBatch._id, {
        quantity: existingBatch.quantity + input.quantity,
        updatedAt: now,
      });
    } else {
      batch = await this.repos.batches.create({
        _id: createId('batch'),
        _openid: this.options.userId,
        schemaVersion: SCHEMA_VERSION,
        itemId: item._id,
        quantity: input.quantity,
        locationId: input.locationId,
        purchaseDate: input.purchaseDate ?? null,
        productionDate: input.productionDate ?? null,
        shelfLifeValue: input.shelfLifeValue ?? null,
        shelfLifeUnit: input.shelfLifeUnit ?? null,
        expiryDate: input.expiryDate,
        purchasePrice: input.purchasePrice ?? null,
        purchaseChannel: input.purchaseChannel ?? null,
        openedDate: null,
        openedExpiryDate: null,
        note: input.note ?? '',
        createdAt: now,
        updatedAt: now,
      });
    }

    const transaction = await this.createTransaction({
      itemId: item._id,
      batchId: batch._id,
      type: 'ADD',
      quantity: input.quantity,
      reason: 'PURCHASE',
      note: input.note,
      operationId,
    });

    await this.resolveRestockIfNeeded(item._id);
    await this.reminderService.recomputeReminders({ itemId: item._id });
    return { item, batch, transaction, merged };
  }

  private async consumeStockCore(input: ConsumeStockInput): Promise<ConsumeStockResult> {
    assertNonEmptyString(input.itemId, 'itemId');
    assertPositiveNumber(input.quantity, 'quantity');
    const operationId = input.operationId ?? createOperationId('consume');
    await this.assertOperationIsNew(operationId);

    const item = await this.requireItem(input.itemId);
    const batches = (await this.repos.batches.listPositiveByItem(this.options.userId, item._id)).sort(compareByEffectiveExpiryDate);
    const total = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    if (total < input.quantity) {
      throw new InventoryError('INSUFFICIENT_STOCK', 'Consume quantity exceeds available stock');
    }

    let remaining = input.quantity;
    const transactions: Transaction[] = [];
    const affectedBatches: Batch[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.quantity, remaining);
      const now = this.now().getTime();
      const updatedBatch = await this.repos.batches.update(this.options.userId, batch._id, {
        quantity: batch.quantity - deduct,
        updatedAt: now,
      });
      affectedBatches.push(updatedBatch);
      transactions.push(await this.createTransaction({
        itemId: item._id,
        batchId: batch._id,
        type: 'CONSUME',
        quantity: -deduct,
        reason: input.reason ?? 'USED',
        note: input.note,
        operationId,
      }));
      remaining -= deduct;
    }

    await this.reminderService.recomputeReminders({ itemId: item._id });
    return { item, transactions, affectedBatches };
  }

  private async adjustStockCore(input: AdjustStockInput): Promise<AdjustStockResult> {
    assertNonEmptyString(input.batchId, 'batchId');
    assertNonNegativeNumber(input.actualQuantity, 'actualQuantity');
    const operationId = input.operationId ?? createOperationId('adjust');

    const batch = await this.requireBatch(input.batchId);
    const diff = input.actualQuantity - batch.quantity;
    if (diff === 0) {
      return { batch, transaction: null, diff };
    }
    await this.assertOperationIsNew(operationId);

    const now = this.now().getTime();
    const updatedBatch = await this.repos.batches.update(this.options.userId, batch._id, {
      quantity: input.actualQuantity,
      updatedAt: now,
    });
    const transaction = await this.createTransaction({
      itemId: batch.itemId,
      batchId: batch._id,
      type: 'ADJUST',
      quantity: diff,
      reason: input.reason ?? 'MANUAL_CORRECTION',
      note: input.note,
      operationId,
    });
    await this.reminderService.recomputeReminders({ itemId: batch.itemId });
    return { batch: updatedBatch, transaction, diff };
  }

  private async withWriteBoundary<T>(handler: (service: InventoryService) => Promise<T>): Promise<T> {
    if (this.options.disableTransactions || !this.repos.runInTransaction) {
      return handler(this);
    }
    return this.repos.runInTransaction(async (repos) => {
      const txReminderService = new ReminderService(repos, this.options);
      const txService = new InventoryService(repos, { ...this.options, disableTransactions: true }, txReminderService);
      return handler(txService);
    });
  }

  private async assertOperationIsNew(operationId: string): Promise<void> {
    const existing = await this.repos.transactions.findByOperationId(this.options.userId, operationId);
    if (existing) {
      throw new InventoryError('DUPLICATE_OPERATION', `Operation has already been applied: ${operationId}`);
    }
  }

  private async createTransaction(input: Omit<Transaction, '_id' | '_openid' | 'schemaVersion' | 'createdAt'>): Promise<Transaction> {
    return this.repos.transactions.create({
      _id: createId('tx'),
      _openid: this.options.userId,
      schemaVersion: SCHEMA_VERSION,
      createdAt: this.now().getTime(),
      ...input,
    });
  }

  private async resolveRestockIfNeeded(itemId: string): Promise<void> {
    const restock = await this.repos.restockItems.findNeededByItem(this.options.userId, itemId);
    if (!restock) return;
    const now = this.now().getTime();
    await this.repos.restockItems.update(this.options.userId, restock._id, {
      status: 'PURCHASED',
      resolvedAt: now,
      updatedAt: now,
    });
  }

  private async requireItem(itemId: string): Promise<Item> {
    const item = await this.repos.items.getById(this.options.userId, itemId);
    if (!item) throw new InventoryError('NOT_FOUND', `Item not found: ${itemId}`);
    return item;
  }

  private async requireBatch(batchId: string): Promise<Batch> {
    const batch = await this.repos.batches.getById(this.options.userId, batchId);
    if (!batch) throw new InventoryError('NOT_FOUND', `Batch not found: ${batchId}`);
    return batch;
  }

  private requireNewItem(input: AddStockInput): CreateItemInput {
    if (!input.item) throw new InventoryError('VALIDATION_ERROR', 'item or itemId is required');
    return input.item;
  }

  private validateCreateItem(input: CreateItemInput): void {
    assertNonEmptyString(input.name, 'name');
    assertNonEmptyString(input.categoryId, 'categoryId');
    assertNonEmptyString(input.unit, 'unit');
    if (input.lowStockThreshold != null) assertNonNegativeNumber(input.lowStockThreshold, 'lowStockThreshold');
    if (input.expiryWarningDays != null) assertNonNegativeNumber(input.expiryWarningDays, 'expiryWarningDays');
  }
}
