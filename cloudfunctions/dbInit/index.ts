export interface DbInitResult {
  ok: true;
  schemaVersion: number;
  collections: string[];
}

export async function main(): Promise<DbInitResult> {
  return {
    ok: true,
    schemaVersion: 1,
    collections: [
      'categories',
      'items',
      'batches',
      'transactions',
      'locations',
      'reminders',
      'restock_items',
      'settings',
    ],
  };
}
