import type { Batch, ExpiryStatus, Item, Reminder, ReminderRecomputeResult, ReminderRecomputeScope, ReminderType, RestockItem, StockStatus } from '../models';
import { SCHEMA_VERSION } from '../config/collections';
import { getEffectiveExpiryDate, getRemainingDays } from '../utils/date';
import { InventoryError } from '../utils/errors';
import { createId } from '../utils/id';
import type { InventoryRepositories as RepositoryBundle } from '../repositories';

export interface ReminderServiceOptions {
  userId: string;
  defaultExpiryWarningDays?: number;
  now?: () => Date;
}

export class ReminderService {
  private readonly defaultExpiryWarningDays: number;
  private readonly now: () => Date;

  constructor(private readonly repos: RepositoryBundle, private readonly options: ReminderServiceOptions) {
    this.defaultExpiryWarningDays = options.defaultExpiryWarningDays ?? 30;
    this.now = options.now ?? (() => new Date());
  }

  calculateExpiryStatus(batch: Batch, warningDays: number, today: Date | string = this.now()): ExpiryStatus {
    const remainingDays = getRemainingDays(getEffectiveExpiryDate(batch), today);
    if (remainingDays < 0) return 'EXPIRED';
    if (remainingDays <= warningDays) return 'EXPIRING';
    return 'NORMAL';
  }

  calculateStockStatus(totalQuantity: number, threshold?: number | null): StockStatus {
    if (totalQuantity === 0) return 'ZERO';
    if (threshold == null) return 'NORMAL';
    if (totalQuantity > 0 && totalQuantity <= threshold) return 'LOW';
    return 'NORMAL';
  }

  async recomputeReminders(scope: ReminderRecomputeScope): Promise<ReminderRecomputeResult> {
    const item = await this.repos.items.getById(this.options.userId, scope.itemId);
    if (!item) return { created: [], updated: [], unchanged: [] };

    const batches = await this.repos.batches.listByItem(this.options.userId, item._id);
    const result: ReminderRecomputeResult = { created: [], updated: [], unchanged: [] };
    const warningDays = item.expiryWarningDays ?? this.defaultExpiryWarningDays;

    for (const batch of batches) {
      if (batch.quantity <= 0) {
        await this.resolveOpen(result, item._id, batch._id, ['EXPIRING', 'EXPIRED']);
        continue;
      }

      const expiryStatus = this.calculateExpiryStatus(batch, warningDays);
      if (expiryStatus === 'EXPIRED') {
        await this.resolveOpen(result, item._id, batch._id, ['EXPIRING']);
        await this.ensureReminder(result, item, batch, 'EXPIRED');
      } else if (expiryStatus === 'EXPIRING') {
        await this.resolveOpen(result, item._id, batch._id, ['EXPIRED']);
        await this.ensureReminder(result, item, batch, 'EXPIRING');
      } else {
        await this.resolveOpen(result, item._id, batch._id, ['EXPIRING', 'EXPIRED']);
      }
    }

    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    const stockStatus = this.calculateStockStatus(totalQuantity, item.lowStockThreshold);
    if (stockStatus === 'ZERO') {
      await this.resolveOpen(result, item._id, null, ['LOW_STOCK']);
      await this.ensureReminder(result, item, null, 'ZERO_STOCK');
    } else if (stockStatus === 'LOW') {
      await this.resolveOpen(result, item._id, null, ['ZERO_STOCK']);
      await this.ensureReminder(result, item, null, 'LOW_STOCK');
    } else {
      await this.resolveOpen(result, item._id, null, ['LOW_STOCK', 'ZERO_STOCK']);
    }

    return result;
  }

  async dismissReminder(reminderId: string): Promise<Reminder> {
    return this.repos.reminders.update(this.options.userId, reminderId, {
      status: 'DISMISSED',
      dismissedAt: this.now().getTime(),
      updatedAt: this.now().getTime(),
    });
  }

  async markReminderRead(reminderId: string): Promise<Reminder> {
    const reminder = await this.repos.reminders.getById(this.options.userId, reminderId);
    if (!reminder) throw new InventoryError('NOT_FOUND', `Reminder not found: ${reminderId}`);
    if (reminder.status !== 'ACTIVE') return reminder;
    return this.repos.reminders.update(this.options.userId, reminderId, {
      status: 'READ',
      readAt: this.now().getTime(),
      updatedAt: this.now().getTime(),
    });
  }

  async addToRestock(itemId: string, note = ''): Promise<RestockItem> {
    const item = await this.repos.items.getById(this.options.userId, itemId);
    if (!item) throw new InventoryError('NOT_FOUND', `Item not found: ${itemId}`);
    const existing = await this.repos.restockItems.findNeededByItem(this.options.userId, itemId);
    if (existing) return existing;
    const now = this.now().getTime();
    return this.repos.restockItems.create({
      _id: createId('restock'),
      _openid: this.options.userId,
      schemaVersion: SCHEMA_VERSION,
      itemId,
      status: 'NEEDED',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      note,
    });
  }

  async dismissRestock(restockId: string): Promise<RestockItem> {
    const restock = (await this.repos.restockItems.listByUser(this.options.userId)).find((item) => item._id === restockId);
    if (!restock) throw new InventoryError('NOT_FOUND', `Restock item not found: ${restockId}`);
    if (restock.status !== 'NEEDED') return restock;
    const now = this.now().getTime();
    return this.repos.restockItems.update(this.options.userId, restockId, {
      status: 'DISMISSED',
      resolvedAt: now,
      updatedAt: now,
    });
  }

  private async ensureReminder(result: ReminderRecomputeResult, item: Item, batch: Batch | null, type: ReminderType): Promise<void> {
    const cycleKey = this.buildCycleKey(item, batch, type);
    const existing = await this.repos.reminders.listByCycleKey(this.options.userId, cycleKey);
    const openExisting = existing.find((reminder) => reminder.status === 'ACTIVE' || reminder.status === 'READ' || reminder.status === 'DISMISSED');
    if (openExisting) {
      result.unchanged.push(openExisting);
      return;
    }

    const now = this.now().getTime();
    const reminder: Reminder = {
      _id: createId('rem'),
      _openid: this.options.userId,
      schemaVersion: SCHEMA_VERSION,
      type,
      itemId: item._id,
      batchId: batch?._id ?? null,
      status: 'ACTIVE',
      cycleKey,
      createdAt: now,
      updatedAt: now,
      readAt: null,
      dismissedAt: null,
      resolvedAt: null,
    };
    result.created.push(await this.repos.reminders.create(reminder));
  }

  private async resolveOpen(result: ReminderRecomputeResult, itemId: string, batchId: string | null, types: ReminderType[]): Promise<void> {
    const open = await this.repos.reminders.listOpenByScope(this.options.userId, { itemId, batchId, types });
    for (const reminder of open) {
      const now = this.now().getTime();
      result.updated.push(await this.repos.reminders.update(this.options.userId, reminder._id, {
        status: 'RESOLVED',
        resolvedAt: now,
        updatedAt: now,
      }));
    }
  }

  private buildCycleKey(item: Item, batch: Batch | null, type: ReminderType): string {
    if (batch) {
      return `${batch._id}:${type}:${getEffectiveExpiryDate(batch)}`;
    }
    const threshold = item.lowStockThreshold ?? 'none';
    return `${item._id}:${type}:${threshold}`;
  }
}

