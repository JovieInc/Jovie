import 'server-only';

import { withDbSessionTx } from '@/lib/auth/session';
import { assertCreatorFinanceEnabled } from '@/lib/finance/flags';
import { buildMoneyOverview, type MoneyOverview } from '@/lib/finance/metrics';
import { requireFinancialOwnerId } from '@/lib/finance/owner';
import {
  listFinanceAccounts,
  listFinanceInstitutions,
  listFinanceTransactions,
} from '@/lib/finance/repository';

/**
 * Server assembly for the private Money overview (JOV-4618).
 *
 * The financial-owner boundary is enforced inside `requireFinancialOwnerId`
 * and again by RLS on every repository call — no creator, workspace, or
 * collaborator scope can reach this payload.
 */
export async function getMoneyOverview(): Promise<MoneyOverview> {
  const ownerUserId = await requireFinancialOwnerId();
  await assertCreatorFinanceEnabled(ownerUserId);
  return withDbSessionTx(
    async tx => {
      const [institutions, accounts, transactions] = await Promise.all([
        listFinanceInstitutions(ownerUserId, tx),
        listFinanceAccounts(ownerUserId, tx),
        // Trend + prior-window comparisons need the full available history.
        listFinanceTransactions(ownerUserId, { limit: 10_000 }, tx),
      ]);
      return buildMoneyOverview({ institutions, accounts, transactions });
    },
    { clerkUserId: ownerUserId, isolationLevel: 'repeatable read' }
  );
}
