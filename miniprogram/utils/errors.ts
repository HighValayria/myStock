export type InventoryErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_QUANTITY_CHANGE'
  | 'DELETE_NOT_ALLOWED';

export class InventoryError extends Error {
  constructor(public readonly code: InventoryErrorCode, message: string) {
    super(message);
    this.name = 'InventoryError';
  }
}

export function isInventoryError(error: unknown): error is InventoryError {
  return error instanceof InventoryError;
}
