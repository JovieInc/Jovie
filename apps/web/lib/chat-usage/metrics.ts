import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

export interface MonthlyUsageSnapshot {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly resetAt: string | null | undefined;
}

export function getMonthlyUsage(data: ChatUsageData): MonthlyUsageSnapshot {
  const limit = data.monthlyLimit ?? data.dailyLimit * 30;
  const used = data.monthlyUsed ?? data.used;

  return {
    limit,
    used,
    remaining: data.monthlyRemaining ?? Math.max(0, limit - used),
    resetAt: data.monthlyResetAt,
  };
}

export function getRemainingPercent(remaining: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((Math.max(0, remaining) / limit) * 100);
}

export function getOverallRemainingPercent(data: ChatUsageData): number {
  const monthly = getMonthlyUsage(data);
  const dailyPercent = getRemainingPercent(data.remaining, data.dailyLimit);
  const monthlyPercent = getRemainingPercent(monthly.remaining, monthly.limit);
  return Math.min(dailyPercent, monthlyPercent);
}

export function formatResetAt(value: string | null | undefined): string {
  if (!value) return 'Reset timing unavailable';
  const resetAt = new Date(value);
  if (Number.isNaN(resetAt.getTime())) return 'Reset timing unavailable';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(resetAt);
}

export function formatUsageResetTime(value: string | null | undefined): string {
  if (!value) return '—';
  const resetAt = new Date(value);
  if (Number.isNaN(resetAt.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(resetAt);
}

export function formatUsageResetDate(value: string | null | undefined): string {
  if (!value) return '—';
  const resetAt = new Date(value);
  if (Number.isNaN(resetAt.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(resetAt);
}
