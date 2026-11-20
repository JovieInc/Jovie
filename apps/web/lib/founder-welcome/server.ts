import 'server-only';

import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { APP_ROUTES } from '@/constants/routes';
import { externalAccountSql } from '@/lib/accounts/internal-account';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { sendStreamEmail } from '@/lib/email/gateway';
import { isEmailSuppressed } from '@/lib/notifications/suppression';
import { PRODUCTION_PUBLIC_ORIGIN } from '@/lib/outbound/claim-url';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { summerCardId } from '@/lib/ovie/summer-card-digest';
import {
  getSummerCard,
  submitSummerCard,
} from '@/lib/ovie/summer-cards.server';
import { buildUnsubscribeUrl } from '@/lib/recovery/email';
import { createFounderWelcomeLedger } from './ledger';
import { markFounderWelcomeSent } from './marker.server';
import {
  type AdmittedVisitor,
  type FounderWelcomeDeps,
  runFounderWelcome,
} from './runner';

const FOUNDER_WELCOME_REASON = 'qualified_golden_path_resolved_artist';
/** Only recent admissions: a welcome weeks late is not a welcome. */
const FOUNDER_WELCOME_WINDOW_DAYS = 14;
const MAX_CANDIDATES = 200;

/**
 * Their own page in the app. These visitors already have an account and the
 * approval claimed their profile, so no claim token is minted: the dashboard
 * profile page is where they make their Jovie page their own. The public page
 * stays private until ownership proof, so it is not the link.
 */
export const FOUNDER_WELCOME_PAGE_URL = `${PRODUCTION_PUBLIC_ORIGIN}${APP_ROUTES.DASHBOARD_PROFILE}`;

export async function loadAdmittedVisitors(
  now: Date
): Promise<AdmittedVisitor[]> {
  const since = new Date(
    now.getTime() - FOUNDER_WELCOME_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const rows = await db
    .select({
      entryId: waitlistEntries.id,
      email: waitlistEntries.email,
      fullName: waitlistEntries.fullName,
      spotifyArtistName: waitlistEntries.spotifyArtistName,
      userName: users.name,
      outboundSuppressedAt: users.outboundSuppressedAt,
      founderWelcomeSentAt: users.founderWelcomeSentAt,
      profileId: creatorProfiles.id,
      isClaimed: creatorProfiles.isClaimed,
      displayName: creatorProfiles.displayName,
    })
    .from(waitlistEntries)
    .innerJoin(users, eq(users.waitlistEntryId, waitlistEntries.id))
    .leftJoin(
      creatorProfiles,
      and(
        eq(creatorProfiles.id, users.activeProfileId),
        eq(creatorProfiles.userId, users.id)
      )
    )
    .where(
      and(
        eq(waitlistEntries.status, 'approved'),
        eq(waitlistEntries.statusReason, FOUNDER_WELCOME_REASON),
        eq(waitlistEntries.canonical, true),
        gte(waitlistEntries.approvedAt, since),
        isNull(users.deletedAt),
        externalAccountSql()
      )
    )
    .orderBy(desc(waitlistEntries.approvedAt))
    .limit(MAX_CANDIDATES);

  const out: AdmittedVisitor[] = [];
  for (const row of rows) {
    const email = row.email.trim();
    if (!email) continue;
    const suppression = await isEmailSuppressed(email);
    out.push({
      entryId: row.entryId,
      email,
      firstName: row.fullName ?? row.userName ?? null,
      artistName: row.spotifyArtistName ?? row.displayName ?? null,
      pageUrl: row.profileId && row.isClaimed ? FOUNDER_WELCOME_PAGE_URL : null,
      suppressed: suppression.suppressed || row.outboundSuppressedAt !== null,
      alreadyWelcomed: row.founderWelcomeSentAt !== null,
    });
  }
  return out;
}

export function buildFounderWelcomeServerDeps(
  visitors: readonly AdmittedVisitor[],
  now: Date
): FounderWelcomeDeps {
  return {
    visitors,
    mailingAddress: process.env.LEGAL_MAILING_ADDRESS?.trim() || null,
    now,
    ledger: createFounderWelcomeLedger(postgresRecordBackend()),
    unsubscribeUrl: buildUnsubscribeUrl,
    async readCard(key) {
      const card = await getSummerCard(summerCardId(key));
      if (!card || card.kind !== 'outbound') return null;
      return {
        status: card.status,
        recipient: card.recipient,
        body: card.body,
      };
    },
    async fileCard(card) {
      const result = await submitSummerCard(card, now);
      return result.outcome === 'conflict' ? 'conflict' : 'filed';
    },
    async send(email) {
      // Lifecycle stream: the gateway re-checks this person's own card, the
      // pause switch, the postal address, unsubscribe headers and suppression.
      const result = await sendStreamEmail({
        stream: 'lifecycle',
        purpose: 'founder-welcome',
        consent: { basis: 'account-relationship' },
        approval: { cardId: summerCardId(email.cardKey) },
        to: email.to,
        subject: email.subject,
        text: email.text,
        headers: email.headers,
        idempotencyKey: email.idempotencyKey,
      });
      return { ok: result.status === 'sent' };
    },
    markWelcomed: entryId => markFounderWelcomeSent(entryId, now),
  };
}

export { runFounderWelcome };

/**
 * One pass, shared by the frequent cron and Summer's route: files a card per
 * newly admitted visitor and sends only where that person's card is approved.
 */
export async function founderWelcomeJob(
  now: Date = new Date()
): Promise<Record<string, unknown>> {
  const visitors = await loadAdmittedVisitors(now);
  return {
    ...(await runFounderWelcome(buildFounderWelcomeServerDeps(visitors, now))),
  };
}
