import 'server-only';

import { getFounderFunnelStageRows } from '@/lib/admin/founder-funnel';
import { readAccountActivation } from '@/lib/db/queries/account-activation';

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
  const records = await readAccountActivation(cohort.rows.map(row => row.id));
  const byId = new Map(records.map(record => [record.id, record]));
  return {
    metricScope: 'customer_only' as const,
    total: cohort.total,
    timeRange: cohort.timeRange,
    definitionVersion: cohort.definitionVersion,
    purpose: 'activation_diagnosis' as const,
    hasMore: cohort.total > cohort.rows.length,
    rows: cohort.rows.map(row => {
      const record = byId.get(row.id);
      const activation = record
        ? {
            status: 'observed' as const,
            accountStatus: record.accountStatus,
            waitlistLinked: record.waitlistLinked,
            waitlistStatus: record.waitlistStatus,
            attachedOnboardingConversation:
              record.attachedOnboardingConversation,
            ownedProfileCount: record.ownedProfileCount,
            claimedProfileCount: record.claimedProfileCount,
            roleClaimCount: record.roleClaimCount,
            // Claim intent is profile-scoped; a cookie/token is not bound to
            // this account by these durable records. Absence is not eligibility.
            claimTokenState: 'unknown' as const,
            claimAttemptState: 'unknown' as const,
          }
        : {
            status: 'unknown' as const,
            reason: 'account_state_unavailable' as const,
          };
      return {
        id: row.id,
        displayName: row.displayName ?? 'Account',
        ...(row.enteredAt ? { enteredAt: row.enteredAt } : {}),
        activation,
      };
    }),
  };
}
