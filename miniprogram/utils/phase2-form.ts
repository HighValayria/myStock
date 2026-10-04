import type { ShelfLifeUnit } from '../models';
import { InventoryError } from './errors';

export interface ParsedOptionalNumberOptions {
  integer?: boolean;
  min?: number;
}

export function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === '';
}

export function parsePositiveNumber(value: unknown, label: string): number {
  const numeric = Number(String(value ?? '').trim());
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new InventoryError('VALIDATION_ERROR', `${label}必须大于0`);
  }
  return numeric;
}

export function parseNonNegativeNumber(value: unknown, label: string): number {
  const numeric = Number(String(value ?? '').trim());
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new InventoryError('VALIDATION_ERROR', `${label}不能小于0`);
  }
  return numeric;
}

export function parseOptionalNumber(value: unknown, label: string, options: ParsedOptionalNumberOptions = {}): number | null {
  if (isBlank(value)) return null;
  const numeric = Number(String(value).trim());
  if (!Number.isFinite(numeric)) throw new InventoryError('VALIDATION_ERROR', `${label}必须是数字`);
  if (options.min != null && numeric < options.min) throw new InventoryError('VALIDATION_ERROR', `${label}不能小于${options.min}`);
  return options.integer ? Math.trunc(numeric) : numeric;
}

export function assertDateOrder(productionDate: string | null | undefined, expiryDate: string): void {
  if (productionDate && expiryDate < productionDate) {
    throw new InventoryError('VALIDATION_ERROR', '到期日期不能早于生产日期');
  }
}

export function resolveExpiryDate(input: {
  expiryDate?: string | null;
  productionDate?: string | null;
  shelfLifeValue?: number | null;
  shelfLifeUnit?: ShelfLifeUnit | null;
}): string {
  if (!isBlank(input.expiryDate)) {
    const expiryDate = String(input.expiryDate).trim();
    assertDateOrder(input.productionDate, expiryDate);
    return expiryDate;
  }
  if (isBlank(input.productionDate) || input.shelfLifeValue == null || !input.shelfLifeUnit) {
    throw new InventoryError('VALIDATION_ERROR', '请填写到期日期，或填写生产日期和保质期');
  }
  const date = new Date(`${input.productionDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new InventoryError('VALIDATION_ERROR', '生产日期格式不正确');
  if (input.shelfLifeUnit === 'DAY') date.setUTCDate(date.getUTCDate() + input.shelfLifeValue);
  if (input.shelfLifeUnit === 'MONTH') date.setUTCMonth(date.getUTCMonth() + input.shelfLifeValue);
  if (input.shelfLifeUnit === 'YEAR') date.setUTCFullYear(date.getUTCFullYear() + input.shelfLifeValue);
  const expiryDate = date.toISOString().slice(0, 10);
  assertDateOrder(input.productionDate, expiryDate);
  return expiryDate;
}

export function createUiOperationId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mapUserError(error: unknown): string {
  const anyError = error as { code?: string; message?: string };
  if (anyError.code === 'INSUFFICIENT_STOCK' || /exceeds available stock|INSUFFICIENT_STOCK/i.test(anyError.message ?? '')) {
    return '库存不足，无法完成本次消耗。';
  }
  if (anyError.code === 'NOT_FOUND') return '没有找到对应数据，请刷新后重试。';
  if (anyError.code === 'DUPLICATE_OPERATION') return '该操作已提交，请不要重复点击。';
  if (anyError.code === 'VALIDATION_ERROR') return anyError.message || '请检查填写内容。';
  if (/network|timeout|fail/i.test(anyError.message ?? '')) return '网络或云服务暂时不可用，请稍后重试。';
  return anyError.message || '操作失败，请稍后重试。';
}
