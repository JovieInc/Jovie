import 'server-only';

import { getFounderFunnelStageRows } from '@/lib/admin/founder-funnel';

/** Diagnostic population, not an outreach eligibility or unclaimed-user list. */
export async function getSummerFounderAccounts(limit: number) {
  const cohort = await getFounderFunnelStageRows(
    'accounts_created',
    '30d',
    limit
  );
  if (cohort.errors.length > 0) {
    return {
      status: 'unavailable' as const,
      reason: 'founder_cohort_read_failed',
    };
  }
  return {
    metricScope: 'customer_only' as const,
    total: cohort.total,
    timeRange: cohort.timeRange,
    definitionVersion: cohort.definitionVersion,
    purpose: 'activation_diagnosis' as const,
    hasMore: cohort.total > cohort.rows.length,
    rows: cohort.rows.map(row => ({
      id: row.id,
      displayName: row.displayName ?? 'Account',
      ...(row.enteredAt ? { enteredAt: row.enteredAt } : {}),
    })),
  };
}
