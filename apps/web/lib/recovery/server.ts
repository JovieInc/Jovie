import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { BASE_URL } from '@/constants/domains';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { sendStreamEmail } from '@/lib/email/gateway';
import { isEmailSuppressed } from '@/lib/notifications/suppression';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { summerCardId } from '@/lib/ovie/summer-card-digest';
import {
  getSummerCard,
  submitSummerCard,
} from '@/lib/ovie/summer-cards.server';
import type { FixCertifier } from './gate';
import { createLedger } from './ledger';
import type { StalledUser } from './policy';
import { KNOWN_BAD_FLOW_FIXES } from './registry';
import { type CardStatus, type RunnerDeps, runRecovery } from './runner';

const MAX_CANDIDATES = 200;

/**
 * Stall classification from product state. No profile means the person never
 * got past signup; a profile that is not live means they stopped at the preview.
 * Paying and finished users are never candidates.
 */
export async function loadStalledUsers(): Promise<StalledUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      outboundSuppressedAt: users.outboundSuppressedAt,
      username: creatorProfiles.username,
      isPublic: creatorProfiles.isPublic,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(and(isNull(users.deletedAt), eq(users.isPro, false)))
    .orderBy(desc(users.createdAt))
    .limit(MAX_CANDIDATES);

  const out: StalledUser[] = [];
  for (const row of rows) {
    if (!row.email) continue;
    if (row.onboardingCompletedAt && row.isPublic) continue; // finished
    const suppression = await isEmailSuppressed(row.email);
    out.push({
      userId: row.id,
      firstName: row.name?.trim().split(/\s+/u)[0] ?? null,
      email: row.email,
      stalledStep: row.username ? 'preview' : 'signup_pending',
      stalledAt: row.createdAt,
      readyUrl: `${BASE_URL}/start`,
      suppressed: suppression.suppressed || row.outboundSuppressedAt !== null,
    });
  }
  return out;
}

export function buildServerRunnerDeps(
  certifier: FixCertifier,
  stalled: readonly StalledUser[]
): RunnerDeps {
  return {
    fixes: KNOWN_BAD_FLOW_FIXES,
    users: stalled,
    certifier,
    ledger: createLedger(postgresRecordBackend()),
    mailingAddress: process.env.LEGAL_MAILING_ADDRESS?.trim() || null,
    now: new Date(),
    async send(email, to, idempotencyKey, approvalKey) {
      // Lifecycle stream: the gateway re-checks the approving card, the
      // postal address, the unsubscribe headers and suppression.
      const result = await sendStreamEmail({
        stream: 'lifecycle',
        purpose: 'signup-recovery',
        consent: { basis: 'account-relationship' },
        ...(approvalKey && { approval: { cardId: summerCardId(approvalKey) } }),
        to,
        subject: email.subject,
        text: email.text,
        headers: email.headers,
        idempotencyKey: `recovery-${idempotencyKey}`,
      });
      return { ok: result.status === 'sent' };
    },
    async cardStatus(key): Promise<CardStatus> {
      const card = await getSummerCard(summerCardId(key));
      if (!card) return 'none';
      return card.status === 'approved'
        ? 'approved'
        : card.status === 'rejected'
          ? 'rejected'
          : 'pending';
    },
    async fileCard(card) {
      await submitSummerCard(card);
    },
  };
}

export { runRecovery };
