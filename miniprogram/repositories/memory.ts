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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface MemoryDoc {
  _id: string;
  _openid: string;
}

class MemoryCollection<T extends MemoryDoc> {
  private readonly docs = new Map<string, T>();

  async create(doc: T): Promise<T> {
    this.docs.set(doc._id, clone(doc));
    return clone(doc);
  }

  async getById(userId: string, id: string): Promise<T | null> {
    const doc = this.docs.get(id);
    if (!doc || doc._openid !== userId) return null;
    return clone(doc);
  }

  async update(userId: string, id: string, patch: Partial<T>): Promise<T> {
    const existing = await this.getById(userId, id);
    if (!existing) throw new InventoryError('NOT_FOUND', `Document not found: ${id}`);
    const next = { ...existing, ...patch } as T;
    this.docs.set(id, clone(next));
    return clone(next);
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.getById(userId, id);
    if (!existing) throw new InventoryError('NOT_FOUND', `Document not found: ${id}`);
    this.docs.delete(id);
  }

  async listByUser(userId: string): Promise<T[]> {
    return [...this.docs.values()].filter((doc) => doc._openid === userId).map(clone);
  }
}

export class MemoryCategoryRepository implements CategoryRepository {
  private readonly collection = new MemoryCollection<Category>();
  create(doc: Category): Promise<Category> { return this.collection.create(doc); }
  getById(userId: string, id: string): Promise<Category | null> { return this.collection.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Category>): Promise<Category> { return this.collection.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.collection.delete(userId, id); }
  listByUser(userId: string): Promise<Category[]> { return this.collection.listByUser(userId); }
}

export class MemoryItemRepository implements ItemRepository {
  private readonly collection = new MemoryCollection<Item>();
  create(doc: Item): Promise<Item> { return this.collection.create(doc); }
  getById(userId: string, id: string): Promise<Item | null> { return this.collection.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Item>): Promise<Item> { return this.collection.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.collection.delete(userId, id); }
  listByUser(userId: string): Promise<Item[]> { return this.collection.listByUser(userId); }
}

export class MemoryBatchRepository implements BatchRepository {
  private readonly collection = new MemoryCollection<Batch>();
  create(doc: Batch): Promise<Batch> { return this.collection.create(doc); }
  getById(userId: string, id: string): Promise<Batch | null> { return this.collection.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Batch>): Promise<Batch> { return this.collection.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.collection.delete(userId, id); }
  listByUser(userId: string): Promise<Batch[]> { return this.collection.listByUser(userId); }

  async listByItem(userId: string, itemId: string): Promise<Batch[]> {
    return (await this.listByUser(userId)).filter((batch) => batch.itemId === itemId);
  }

  async listPositiveByItem(userId: string, itemId: string): Promise<Batch[]> {
    return (await this.listByItem(userId, itemId)).filter((batch) => batch.quantity > 0);
  }

  async findMergeCandidate(userId: string, itemId: string, locationId: string, purchaseDate: string | null | undefined, expiryDate: string): Promise<Batch | null> {
    const normalizedPurchaseDate = purchaseDate ?? null;
    return (await this.listByItem(userId, itemId)).find((batch) =>
      batch.locationId === locationId &&
      (batch.purchaseDate ?? null) === normalizedPurchaseDate &&
      batch.expiryDate === expiryDate
    ) ?? null;
  }
}

export class MemoryTransactionRepository implements TransactionRepository {
  private readonly collection = new MemoryCollection<Transaction>();
  create(doc: Transaction): Promise<Transaction> { return this.collection.create(doc); }
  getById(userId: string, id: string): Promise<Transaction | null> { return this.collection.getById(userId, id); }
  delete(userId: string, id: string): Promise<void> { return this.collection.delete(userId, id); }
  listByUser(userId: string): Promise<Transaction[]> { return this.collection.listByUser(userId); }

  async findByOperationId(userId: string, operationId: string): Promise<Transaction | null> {
    return (await this.listByUser(userId)).find((tx) => tx.operationId === operationId) ?? null;
  }

  async listByItem(userId: string, itemId: string, limit = 20): Promise<Transaction[]> {
    return (await this.listByUser(userId))
      .filter((tx) => tx.itemId === itemId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

export class MemoryLocationRepository implements LocationRepository {
  private readonly collection = new MemoryCollection<Location>();
  create(doc: Location): Promise<Location> { return this.collection.create(doc); }
  getById(userId: string, id: string): Promise<Location | null> { return this.collection.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Location>): Promise<Location> { return this.collection.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.collection.delete(userId, id); }
  listByUser(userId: string): Promise<Location[]> { return this.collection.listByUser(userId); }
}

export class MemoryReminderRepository implements ReminderRepository {
  private readonly collection = new MemoryCollection<Reminder>();
  create(doc: Reminder): Promise<Reminder> { return this.collection.create(doc); }
  getById(userId: string, id: string): Promise<Reminder | null> { return this.collection.getById(userId, id); }
  update(userId: string, id: string, patch: Partial<Reminder>): Promise<Reminder> { return this.collection.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.collection.delete(userId, id); }
  listByUser(userId: string): Promise<Reminder[]> { return this.collection.listByUser(userId); }

  async listByItem(userId: string, itemId: string): Promise<Reminder[]> {
    return (await this.listByUser(userId)).filter((reminder) => reminder.itemId === itemId);
  }

  async listByCycleKey(userId: string, cycleKey: string): Promise<Reminder[]> {
    return (await this.listByUser(userId)).filter((reminder) => reminder.cycleKey === cycleKey);
  }

  async listOpenByScope(userId: string, scope: { itemId: string; batchId?: string | null; types?: ReminderType[] }): Promise<Reminder[]> {
    return (await this.listByItem(userId, scope.itemId)).filter((reminder) => {
      const typeMatches = !scope.types || scope.types.includes(reminder.type);
      const batchMatches = scope.batchId === undefined || (reminder.batchId ?? null) === (scope.batchId ?? null);
      return typeMatches && batchMatches && OPEN_REMINDER_STATUSES.includes(reminder.status);
    });
  }
}

export class MemoryRestockRepository implements RestockRepository {
  private readonly collection = new MemoryCollection<RestockItem>();
  create(doc: RestockItem): Promise<RestockItem> { return this.collection.create(doc); }
  update(userId: string, id: string, patch: Partial<RestockItem>): Promise<RestockItem> { return this.collection.update(userId, id, patch); }
  delete(userId: string, id: string): Promise<void> { return this.collection.delete(userId, id); }
  listByUser(userId: string): Promise<RestockItem[]> { return this.collection.listByUser(userId); }

  async findNeededByItem(userId: string, itemId: string): Promise<RestockItem | null> {
    return (await this.listByUser(userId)).find((item) => item.itemId === itemId && item.status === 'NEEDED') ?? null;
  }
}

export class MemorySettingsRepository implements SettingsRepository {
  private readonly collection = new MemoryCollection<Settings>();

  async getByUser(userId: string): Promise<Settings | null> {
    return (await this.collection.listByUser(userId))[0] ?? null;
  }

  async upsertForUser(doc: Settings): Promise<Settings> {
    const existing = await this.getByUser(doc._openid);
    if (!existing) return this.collection.create(doc);
    return this.collection.update(doc._openid, existing._id, doc);
  }

  async deleteForUser(userId: string): Promise<void> {
    const existing = await this.getByUser(userId);
    if (existing) await this.collection.delete(userId, existing._id);
  }
}

export function createMemoryRepositories(): InventoryRepositories {
  const repos: InventoryRepositories = {
    categories: new MemoryCategoryRepository(),
    items: new MemoryItemRepository(),
    batches: new MemoryBatchRepository(),
    transactions: new MemoryTransactionRepository(),
    locations: new MemoryLocationRepository(),
    reminders: new MemoryReminderRepository(),
    restockItems: new MemoryRestockRepository(),
    settings: new MemorySettingsRepository(),
  };
  repos.runInTransaction = async (handler) => handler(repos);
  return repos;
}


