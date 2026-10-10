import type {
  ConsumeStrategy,
  ExpiryStatus,
  ReminderStatus,
  ReminderType,
  RestockStatus,
  ShelfLifeUnit,
  StockStatus,
  ThemeMode,
  TransactionReason,
  TransactionType,
} from './enums';
import type { BaseDoc } from './base';

export interface Category extends BaseDoc {
  name: string;
  icon?: string | null;
  expiryWarningDays?: number | null;
  defaultLowStock?: number | null;
}

export interface Item extends BaseDoc {
  name: string;
  categoryId: string;
  brand?: string | null;
  specification?: string | null;
  unit: string;
  defaultLocationId?: string | null;
  lowStockThreshold?: number | null;
  expiryWarningDays?: number | null;
  barcode?: string | null;
  note?: string;
}

export interface Batch extends BaseDoc {
  itemId: string;
  quantity: number;
  locationId: string;
  purchaseDate?: string | null;
  productionDate?: string | null;
  shelfLifeValue?: number | null;
  shelfLifeUnit?: ShelfLifeUnit | null;
  expiryDate: string;
  /** Unit purchase price. Total value is quantity * purchasePrice. */
  purchasePrice?: number | null;
  purchaseChannel?: string | null;
  openedDate?: string | null;
  openedExpiryDate?: string | null;
  note?: string;
}

export interface Transaction extends Omit<BaseDoc, 'updatedAt'> {
  itemId: string;
  batchId: string;
  type: TransactionType;
  quantity: number;
  reason: TransactionReason;
  note?: string;
  operationId?: string;
}

export interface Location extends BaseDoc {
  name: string;
  parentId?: string | null;
}

export interface Reminder extends BaseDoc {
  type: ReminderType;
  itemId: string;
  batchId?: string | null;
  status: ReminderStatus;
  cycleKey: string;
  readAt?: number | null;
  dismissedAt?: number | null;
  resolvedAt?: number | null;
}

export interface RestockItem extends BaseDoc {
  itemId: string;
  status: RestockStatus;
  resolvedAt?: number | null;
  note?: string;
}

export interface Settings extends BaseDoc {
  defaultExpiryWarningDays: number;
  defaultConsumeStrategy: ConsumeStrategy;
  lowStockReminder: boolean;
  expiryReminder: boolean;
  zeroStockReminder: boolean;
  autoAddRestock: boolean;
  theme: ThemeMode;
}

export interface CreateItemInput {
  name: string;
  categoryId: string;
  unit: string;
  brand?: string | null;
  specification?: string | null;
  defaultLocationId?: string | null;
  lowStockThreshold?: number | null;
  expiryWarningDays?: number | null;
  barcode?: string | null;
  note?: string;
}

export interface AddStockInput {
  itemId?: string;
  item?: CreateItemInput;
  quantity: number;
  locationId: string;
  purchaseDate?: string | null;
  productionDate?: string | null;
  shelfLifeValue?: number | null;
  shelfLifeUnit?: ShelfLifeUnit | null;
  expiryDate: string;
  /** Unit purchase price. Total value is quantity * purchasePrice. */
  purchasePrice?: number | null;
  purchaseChannel?: string | null;
  note?: string;
  operationId?: string;
}

export interface ConsumeStockInput {
  itemId: string;
  quantity: number;
  reason?: Extract<TransactionReason, 'USED' | 'EXPIRED' | 'DAMAGED' | 'GIFT' | 'OTHER'>;
  note?: string;
  operationId?: string;
}

export interface AdjustStockInput {
  batchId: string;
  actualQuantity: number;
  reason?: 'MANUAL_CORRECTION';
  note?: string;
  operationId?: string;
}

export type UpdateItemInput = Partial<Omit<Item, keyof BaseDoc>>;
export type UpdateBatchInput = Partial<Omit<Batch, keyof BaseDoc | 'quantity' | 'itemId'>>;

export interface DeleteItemOptions {
  confirmEmptyItem: boolean;
}

export interface AddStockResult {
  item: Item;
  batch: Batch;
  transaction: Transaction;
  merged: boolean;
}

export interface ConsumeStockResult {
  item: Item;
  transactions: Transaction[];
  affectedBatches: Batch[];
}

export interface AdjustStockResult {
  batch: Batch;
  transaction: Transaction | null;
  diff: number;
}

export interface InventoryQuery {
  search?: string;
  categoryId?: string;
  locationId?: string;
  expiryStatus?: ExpiryStatus;
  stockStatus?: StockStatus;
}

export interface InventoryListItem {
  item: Item;
  totalQuantity: number;
  nearestExpiryDate?: string | null;
  nearestRemainingDays?: number | null;
  expiryStatus: ExpiryStatus;
  stockStatus: StockStatus;
}

export interface ItemDetail {
  item: Item;
  batches: Array<Batch & { remainingDays: number; expiryStatus: ExpiryStatus }>;
  recentTransactions: Transaction[];
  totalQuantity: number;
  stockStatus: StockStatus;
  reminders: Reminder[];
  restockItem?: RestockItem | null;
}

export interface ReminderRecomputeScope {
  itemId: string;
}

export interface ReminderRecomputeResult {
  created: Reminder[];
  updated: Reminder[];
  unchanged: Reminder[];
}
