import 'server-only';
import { and, eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import { connectorWriteReceipts } from '@/lib/db/schema/connector-write-receipts';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import type { ProfileWriteAdapter, ProfileWriteLedger } from './contract';
import { ProfileWriteService } from './service';

export const profileWriteLedger: ProfileWriteLedger = {
  async authorize(userId, destination, scopes) {
    return withDbSessionTx(
      async tx => {
        const [account] = await tx
          .select()
          .from(connectorAccounts)
          .where(
            and(
              eq(connectorAccounts.id, destination.connectorAccountId),
              eq(connectorAccounts.userId, userId),
              eq(connectorAccounts.status, 'connected'),
              eq(
                connectorAccounts.providerAccountId,
                destination.destinationAccountId
              )
            )
          )
          .limit(1);
        return Boolean(
          account &&
            account.provider === destination.providerId &&
            scopes.every(scope => account.scopes.includes(scope))
        );
      },
      { clerkUserId: userId }
    );
  },
  async get(userId, proposalId, phase) {
    return withDbSessionTx(
      async tx => {
        const [row] = await tx
          .select({ receipt: connectorWriteReceipts.receipt })
          .from(connectorWriteReceipts)
          .where(
            and(
              eq(connectorWriteReceipts.userId, userId),
              eq(connectorWriteReceipts.proposalId, proposalId),
              eq(connectorWriteReceipts.phase, phase)
            )
          )
          .limit(1);
        return row?.receipt ?? null;
      },
      { clerkUserId: userId }
    );
  },
  async append(receipt, rateKey) {
    return withDbSessionTx(
      async tx => {
        const [row] = await tx
          .insert(connectorWriteReceipts)
          .values({
            id: receipt.id,
            userId: receipt.proposal.userId,
            proposalId: receipt.proposal.id,
            connectorAccountId: receipt.proposal.connectorAccountId,
            phase: receipt.phase,
            rateKey,
            receipt,
          })
          .onConflictDoNothing()
          .returning({ id: connectorWriteReceipts.id });
        return Boolean(row);
      },
      { clerkUserId: receipt.proposal.userId }
    );
  },
};

/** Adapters are trusted server code, never supplied by an HTTP request. */
export function createProfileWriteService(adapter: ProfileWriteAdapter) {
  return new ProfileWriteService(profileWriteLedger, adapter);
}
