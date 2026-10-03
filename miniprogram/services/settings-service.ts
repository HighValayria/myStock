import { SCHEMA_VERSION } from '../config/collections';
import type { Settings } from '../models';
import type { InventoryRepositories } from '../repositories';
import { createId } from '../utils/id';

export interface SettingsServiceOptions {
  userId: string;
  now?: () => Date;
}

export class SettingsService {
  private readonly now: () => Date;

  constructor(private readonly repos: InventoryRepositories, private readonly options: SettingsServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async ensureDefaultSettings(): Promise<Settings> {
    const existing = await this.repos.settings.getByUser(this.options.userId);
    if (existing) return existing;

    const now = this.now().getTime();
    return this.repos.settings.upsertForUser({
      _id: createId('settings'),
      _openid: this.options.userId,
      schemaVersion: SCHEMA_VERSION,
      defaultExpiryWarningDays: 30,
      defaultConsumeStrategy: 'FEFO',
      lowStockReminder: true,
      expiryReminder: true,
      zeroStockReminder: true,
      autoAddRestock: false,
      theme: 'system',
      createdAt: now,
      updatedAt: now,
    });
  }
}
