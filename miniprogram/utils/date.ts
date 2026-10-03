import type { Batch } from '../models';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function assertDateOnly(value: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must be YYYY-MM-DD`);
  }
}

export function dateOnlyToUtcMs(value: string): number {
  assertDateOnly(value, 'date');
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function toDateOnly(value: Date | string): string {
  if (typeof value === 'string') {
    assertDateOnly(value, 'date');
    return value;
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getEffectiveExpiryDate(batch: Pick<Batch, 'expiryDate' | 'openedExpiryDate'>): string {
  if (!batch.openedExpiryDate) return batch.expiryDate;
  return dateOnlyToUtcMs(batch.openedExpiryDate) < dateOnlyToUtcMs(batch.expiryDate)
    ? batch.openedExpiryDate
    : batch.expiryDate;
}

export function getRemainingDays(expiryDate: string, today: Date | string): number {
  const todayDate = toDateOnly(today);
  return Math.floor((dateOnlyToUtcMs(expiryDate) - dateOnlyToUtcMs(todayDate)) / MS_PER_DAY);
}

export function compareByEffectiveExpiryDate(a: Batch, b: Batch): number {
  const expiryDiff = dateOnlyToUtcMs(getEffectiveExpiryDate(a)) - dateOnlyToUtcMs(getEffectiveExpiryDate(b));
  if (expiryDiff !== 0) return expiryDiff;
  return a.createdAt - b.createdAt;
}
