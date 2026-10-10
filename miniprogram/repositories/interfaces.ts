import type {
  Batch,
  Category,
  Item,
  Location,
  Reminder,
  ReminderStatus,
  ReminderType,
  RestockItem,
  Settings,
  Transaction,
} from '../models';

export interface CategoryRepository {
  create(doc: Category): Promise<Category>;
  getById(userId: string, id: string): Promise<Category | null>;
  update(userId: string, id: string, patch: Partial<Category>): Promise<Category>;
  delete(userId: string, id: string): Promise<void>;
  listByUser(userId: string): Promise<Category[]>;
}

export interface ItemRepository {
  create(doc: Item): Promise<Item>;
  getById(userId: string, id: string): Promise<Item | null>;
  update(userId: string, id: string, patch: Partial<Item>): Promise<Item>;
  delete(userId: string, id: string): Promise<void>;
  listByUser(userId: string): Promise<Item[]>;
}

export interface BatchRepository {
  create(doc: Batch): Promise<Batch>;
  getById(userId: string, id: string): Promise<Batch | null>;
  update(userId: string, id: string, patch: Partial<Batch>): Promise<Batch>;
  delete(userId: string, id: string): Promise<void>;
  listByUser(userId: string): Promise<Batch[]>;
  listByItem(userId: string, itemId: string): Promise<Batch[]>;
  listPositiveByItem(userId: string, itemId: string): Promise<Batch[]>;
  findMergeCandidate(userId: string, itemId: string, locationId: string, purchaseDate: string | null | undefined, expiryDate: string): Promise<Batch | null>;
}

export interface TransactionRepository {
  create(doc: Transaction): Promise<Transaction>;
  getById(userId: string, id: string): Promise<Transaction | null>;
  delete(userId: string, id: string): Promise<void>;
  findByOperationId(userId: string, operationId: string): Promise<Transaction | null>;
  listByUser(userId: string): Promise<Transaction[]>;
  listByItem(userId: string, itemId: string, limit?: number): Promise<Transaction[]>;
}

export interface LocationRepository {
  create(doc: Location): Promise<Location>;
  getById(userId: string, id: string): Promise<Location | null>;
  update(userId: string, id: string, patch: Partial<Location>): Promise<Location>;
  delete(userId: string, id: string): Promise<void>;
  listByUser(userId: string): Promise<Location[]>;
}

export interface ReminderRepository {
  create(doc: Reminder): Promise<Reminder>;
  getById(userId: string, id: string): Promise<Reminder | null>;
  update(userId: string, id: string, patch: Partial<Reminder>): Promise<Reminder>;
  delete(userId: string, id: string): Promise<void>;
  listByUser(userId: string): Promise<Reminder[]>;
  listByItem(userId: string, itemId: string): Promise<Reminder[]>;
  listByCycleKey(userId: string, cycleKey: string): Promise<Reminder[]>;
  listOpenByScope(userId: string, scope: { itemId: string; batchId?: string | null; types?: ReminderType[] }): Promise<Reminder[]>;
}

export interface RestockRepository {
  create(doc: RestockItem): Promise<RestockItem>;
  update(userId: string, id: string, patch: Partial<RestockItem>): Promise<RestockItem>;
  delete(userId: string, id: string): Promise<void>;
  listByUser(userId: string): Promise<RestockItem[]>;
  findNeededByItem(userId: string, itemId: string): Promise<RestockItem | null>;
}

export interface SettingsRepository {
  getByUser(userId: string): Promise<Settings | null>;
  upsertForUser(doc: Settings): Promise<Settings>;
  deleteForUser(userId: string): Promise<void>;
}

export interface InventoryRepositories {
  categories: CategoryRepository;
  items: ItemRepository;
  batches: BatchRepository;
  transactions: TransactionRepository;
  locations: LocationRepository;
  reminders: ReminderRepository;
  restockItems: RestockRepository;
  settings: SettingsRepository;
  runInTransaction?<T>(handler: (repos: InventoryRepositories) => Promise<T>): Promise<T>;
}

export const OPEN_REMINDER_STATUSES: ReminderStatus[] = ['ACTIVE', 'READ', 'DISMISSED'];
