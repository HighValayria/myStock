import type { ExpiryStatus, StockStatus, Transaction } from '../models';
import { UNKNOWN_EXPIRY_DATE } from './phase2-form';

export function expiryStatusLabel(status: ExpiryStatus): string {
  if (status === 'EXPIRED') return '已过期';
  if (status === 'EXPIRING') return '临期';
  return '正常';
}

export function stockStatusLabel(status: StockStatus): string {
  if (status === 'ZERO') return '零库存';
  if (status === 'LOW') return '低库存';
  return '正常';
}

export function formatDate(value?: string | null): string {
  if (!value || value === UNKNOWN_EXPIRY_DATE) return '未知';
  return value.slice(5).replace('-', '/');
}

export function formatRemainingDays(value?: number | null): string {
  if (value == null) return '未知';
  if (value < 0) return `已过期 ${Math.abs(value)} 天`;
  if (value === 0) return '今天到期';
  return `剩余 ${value} 天`;
}

export function transactionTypeLabel(type: Transaction['type']): string {
  if (type === 'ADD') return '增加';
  if (type === 'CONSUME') return '消耗';
  if (type === 'ADJUST') return '库存修正';
  if (type === 'DISCARD') return '丢弃';
  if (type === 'DELETE') return '删除';
  return '库存变化';
}

export function transactionQuantityText(transaction: Transaction, unit: string): string {
  const quantity = transaction.quantity;
  const sign = quantity > 0 ? '+' : '';
  return `${sign}${quantity}${unit}`;
}

export function formatTransactionDate(createdAt: number): string {
  const date = new Date(createdAt);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

export function visibleExpiryDate(value?: string | null): string {
  return !value || value === UNKNOWN_EXPIRY_DATE ? '无到期日' : value;
}
