import { COLLECTIONS } from '../config/collections';
import type {
  Batch,
  Category,
  Item,
  Location,
  Reminder,
  ReminderType,
  RestockItem,
  Settings,
  Transaction,
} from '../models';
import { InventoryError } from '../utils/errors';
import type {
  BatchRepository,
  CategoryRepository,
  InventoryRepositories,
  ItemRepository,
  LocationRepository,
  ReminderRepository,
  RestockRepository,
  SettingsRepository,
  TransactionRepository,
} from './interfaces';
import { OPEN_REMINDER_STATUSES } from './interfaces';

type CloudDb = any;
type CloudCollection = any;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getCloudDatabase(): CloudDb {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new InventoryError('VALIDATION_ERROR', 'wx.cloud is not initialized');
  }
  return wx.cloud.database();
}

async function first<T>(query: Promise<{ data: T[] }>): Promise<T | null> {
  const result = await query;
  return result.data[0] ? clone(result.data[0]) : null;
}

class CloudCollectionRepository<T extends { _id: string; _openid: string }> {
  constructor(private readonly db: CloudDb, private readonly collectionName: string) {}

  protected collection(): CloudCollection {
    return this.db.collection(this.collectionName);
  }

  async create(doc: T): Promise<T> {
    await this.collection().add({ data: clone(doc) });
    return clone(doc);
  }

  async getById(userId: string, id: string): Promise<T | null> {
    return first<T>(this.collection().where({ _id: id, _openid: userId }).limit(1).get());
  }

  async update(userId: string, id: string, patch: Partial<T>): Promise<T> {
    const existing = await this.getById(userId, id);
    if (!existing) throw new InventoryError('NOT_FOUND', `Document not found: ${id}`);
    await this.collection().where({ _id: id, _openid: userId }).update({ data: clone(patch) });
    const updated = await this.getById(userId, id);
    if (!updated) throw new InventoryError('NOT_FOUND', `Document not found after update: ${id}`);
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.getById(userId, id);
    if (!existing) throw new InventoryError('NOT_FOUND', `Document not found: ${id}`);
    await this.collection().where({ _id: id, _openid: userId }).remove();
  }

  async listByUser(userId: string): Promise<T[]> {
    const result = await this.collection().where({ _openid: userId }).get();
    return result.data.map(clone) as T[];
  }
}

export class CloudCategoryRepository implements CategoryRepository {
  private readonly base: CloudCollectionRepository<Category>;
  constructor(db: CloudDb) { this.base = new CloudCollectionRepository<Category>(db, COLLECTIONS.categories); }
  create(doc: Category): Promise<Category> { return this.base.create(doc); }
  getById(userId: string, id: string): Promise<Category | null> { return this.base.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Category>): Promise<Category> { return this.base.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.base.delete(userId, id); }
  listByUser(userId: string): Promise<Category[]> { return this.base.listByUser(userId); }
}

export class CloudItemRepository implements ItemRepository {
  private readonly base: CloudCollectionRepository<Item>;
  constructor(db: CloudDb) { this.base = new CloudCollectionRepository<Item>(db, COLLECTIONS.items); }
  create(doc: Item): Promise<Item> { return this.base.create(doc); }
  getById(userId: string, id: string): Promise<Item | null> { return this.base.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Item>): Promise<Item> { return this.base.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.base.delete(userId, id); }
  listByUser(userId: string): Promise<Item[]> { return this.base.listByUser(userId); }
}

export class CloudBatchRepository implements BatchRepository {
  private readonly base: CloudCollectionRepository<Batch>;
  constructor(private readonly db: CloudDb) { this.base = new CloudCollectionRepository<Batch>(db, COLLECTIONS.batches); }
  create(doc: Batch): Promise<Batch> { return this.base.create(doc); }
  getById(userId: string, id: string): Promise<Batch | null> { return this.base.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Batch>): Promise<Batch> { return this.base.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.base.delete(userId, id); }
  listByUser(userId: string): Promise<Batch[]> { return this.base.listByUser(userId); }
  async listByItem(userId: string, itemId: string): Promise<Batch[]> {
    const result = await this.db.collection(COLLECTIONS.batches).where({ _openid: userId, itemId }).get();
    return result.data.map(clone) as Batch[];
  }
  async listPositiveByItem(userId: string, itemId: string): Promise<Batch[]> {
    return (await this.listByItem(userId, itemId)).filter((batch) => batch.quantity > 0);
  }
  async findMergeCandidate(userId: string, itemId: string, locationId: string, purchaseDate: string | null | undefined, expiryDate: string): Promise<Batch | null> {
    return first<Batch>(this.db.collection(COLLECTIONS.batches).where({
      _openid: userId,
      itemId,
      locationId,
      purchaseDate: purchaseDate ?? null,
      expiryDate,
    }).limit(1).get());
  }
}

export class CloudTransactionRepository implements TransactionRepository {
  private readonly base: CloudCollectionRepository<Transaction>;
  constructor(private readonly db: CloudDb) { this.base = new CloudCollectionRepository<Transaction>(db, COLLECTIONS.transactions); }
  create(doc: Transaction): Promise<Transaction> { return this.base.create(doc); }
  getById(userId: string, id: string): Promise<Transaction | null> { return this.base.getById(userId, id); }
  delete(userId: string, id: string): Promise<void> { return this.base.delete(userId, id); }
  async findByOperationId(userId: string, operationId: string): Promise<Transaction | null> {
    return first<Transaction>(this.db.collection(COLLECTIONS.transactions).where({ _openid: userId, operationId }).limit(1).get());
  }
  listByUser(userId: string): Promise<Transaction[]> { return this.base.listByUser(userId); }
  async listByItem(userId: string, itemId: string, limit = 20): Promise<Transaction[]> {
    const result = await this.db.collection(COLLECTIONS.transactions).where({ _openid: userId, itemId }).orderBy('createdAt', 'desc').limit(limit).get();
    return result.data.map(clone) as Transaction[];
  }
}

export class CloudLocationRepository implements LocationRepository {
  private readonly base: CloudCollectionRepository<Location>;
  constructor(db: CloudDb) { this.base = new CloudCollectionRepository<Location>(db, COLLECTIONS.locations); }
  create(doc: Location): Promise<Location> { return this.base.create(doc); }
  getById(userId: string, id: string): Promise<Location | null> { return this.base.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Location>): Promise<Location> { return this.base.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.base.delete(userId, id); }
  listByUser(userId: string): Promise<Location[]> { return this.base.listByUser(userId); }
}

export class CloudReminderRepository implements ReminderRepository {
  private readonly base: CloudCollectionRepository<Reminder>;
  constructor(private readonly db: CloudDb) { this.base = new CloudCollectionRepository<Reminder>(db, COLLECTIONS.reminders); }
  create(doc: Reminder): Promise<Reminder> { return this.base.create(doc); }
  getById(userId: string, id: string): Promise<Reminder | null> { return this.base.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Reminder>): Promise<Reminder> { return this.base.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.base.delete(userId, id); }
  listByUser(userId: string): Promise<Reminder[]> { return this.base.listByUser(userId); }
  async listByItem(userId: string, itemId: string): Promise<Reminder[]> {
    const result = await this.db.collection(COLLECTIONS.reminders).where({ _openid: userId, itemId }).get();
    return result.data.map(clone) as Reminder[];
  }
  async listByCycleKey(userId: string, cycleKey: string): Promise<Reminder[]> {
    const result = await this.db.collection(COLLECTIONS.reminders).where({ _openid: userId, cycleKey }).get();
    return result.data.map(clone) as Reminder[];
  }
  async listOpenByScope(userId: string, scope: { itemId: string; batchId?: string | null; types?: ReminderType[] }): Promise<Reminder[]> {
    return (await this.listByItem(userId, scope.itemId)).filter((reminder) => {
      const typeMatches = !scope.types || scope.types.includes(reminder.type);
      const batchMatches = scope.batchId === undefined || (reminder.batchId ?? null) === (scope.batchId ?? null);
      return typeMatches && batchMatches && OPEN_REMINDER_STATUSES.includes(reminder.status);
    });
  }
}

export class CloudRestockRepository implements RestockRepository {
  private readonly base: CloudCollectionRepository<RestockItem>;
  constructor(private readonly db: CloudDb) { this.base = new CloudCollectionRepository<RestockItem>(db, COLLECTIONS.restockItems); }
  create(doc: RestockItem): Promise<RestockItem> { return this.base.create(doc); }
  update(userId: string, id: string, patch: Partial<RestockItem>): Promise<RestockItem> { return this.base.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.base.delete(userId, id); }
  listByUser(userId: string): Promise<RestockItem[]> { return this.base.listByUser(userId); }
  async findNeededByItem(userId: string, itemId: string): Promise<RestockItem | null> {
    return first<RestockItem>(this.db.collection(COLLECTIONS.restockItems).where({ _openid: userId, itemId, status: 'NEEDED' }).limit(1).get());
  }
}

export class CloudSettingsRepository implements SettingsRepository {
  constructor(private readonly db: CloudDb) {}
  async getByUser(userId: string): Promise<Settings | null> {
    return first<Settings>(this.db.collection(COLLECTIONS.settings).where({ _openid: userId }).limit(1).get());
  }
  async upsertForUser(doc: Settings): Promise<Settings> {
    const existing = await this.getByUser(doc._openid);
    if (!existing) {
      await this.db.collection(COLLECTIONS.settings).add({ data: clone(doc) });
      return clone(doc);
    }
    await this.db.collection(COLLECTIONS.settings).where({ _id: existing._id, _openid: doc._openid }).update({ data: clone(doc) });
    return (await this.getByUser(doc._openid)) ?? clone(doc);
  }
  async deleteForUser(userId: string): Promise<void> {
    const existing = await this.getByUser(userId);
    if (existing) await this.db.collection(COLLECTIONS.settings).where({ _id: existing._id, _openid: userId }).remove();
  }
}

function createCloudRepositoriesForDb(db: CloudDb): InventoryRepositories {
  const repos: InventoryRepositories = {
    categories: new CloudCategoryRepository(db),
    items: new CloudItemRepository(db),
    batches: new CloudBatchRepository(db),
    transactions: new CloudTransactionRepository(db),
    locations: new CloudLocationRepository(db),
    reminders: new CloudReminderRepository(db),
    restockItems: new CloudRestockRepository(db),
    settings: new CloudSettingsRepository(db),
  };

  return repos;
}

export function createCloudRepositories(db: CloudDb = getCloudDatabase()): InventoryRepositories {
  return createCloudRepositoriesForDb(db);
}
