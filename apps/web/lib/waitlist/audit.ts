import 'server-only';

import type { DbOrTransaction } from '@/lib/db';
import { waitlistAuditLogs } from '@/lib/db/schema/waitlist';
import type { WaitlistStatus } from '@/lib/waitlist/state-machine';

export async function insertWaitlistAuditLog(
  tx: DbOrTransaction,
  input: {
    waitlistEntryId: string;
    fromStatus?: WaitlistStatus | null;
    toStatus: WaitlistStatus;
    reason?: string | null;
    actorUserId?: string | null;
    actorType?: 'system' | 'admin' | 'user' | 'job';
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  await tx.insert(waitlistAuditLogs).values({
    waitlistEntryId: input.waitlistEntryId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? 'system',
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  });
}
