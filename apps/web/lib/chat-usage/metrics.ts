import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { createUsageMeterModel, type UsageMeterModel } from '@/lib/usage/model';

export function getWeeklyUsageModel(
  data: ChatUsageData
): UsageMeterModel | null {
  return createUsageMeterModel({
    used: data.used,
    limit: data.weeklyLimit,
    remaining: data.remaining,
    resetAt: data.resetAt,
    warningRemaining: data.warningThreshold,
  });
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
