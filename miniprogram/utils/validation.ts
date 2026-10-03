import { InventoryError } from './errors';

export function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InventoryError('VALIDATION_ERROR', `${fieldName} is required`);
  }
}

export function assertPositiveNumber(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new InventoryError('VALIDATION_ERROR', `${fieldName} must be a positive number`);
  }
}

export function assertNonNegativeNumber(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new InventoryError('VALIDATION_ERROR', `${fieldName} must be a non-negative number`);
  }
}
