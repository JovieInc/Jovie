import 'server-only';

import { and, count, desc, eq, or } from 'drizzle-orm';
import {
  type CanonicalContactListRow,
  getCanonicalContacts,
} from '@/lib/admin/contacts';
import { db } from '@/lib/db';
import { ingestAuditLogs } from '@/lib/db/schema/audit';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureError } from '@/lib/error-tracking';
import { isInternalOrTestAccountEmail } from '@/lib/utils/email';

/**
 * Canonical customer-recovery inspector (JOV-7482).
 *
 * Read model only: it assembles independently observed facts (identity,
 * management authority, admission, plan, connections, launch/asset evidence,
 * recent operations) from the same source rows as the canonical contacts
 * projection — never a second customer store. The single recovery path is a
 * supported, reversible domain operation: re-running failed artist
 * ingestion, which enqueues the same enrichment jobs as the Creators bulk
 * action. Paid ≠ admitted; reserved ≠ artist-managed — each is reported as
 * its own fact.
 */

export type CustomerRecoveryBlockerKind =
  | 'none'
  | 'ingestion-failed'
  | 'ingestion-in-flight'
  | 'ingestion-missing-source';

export type CustomerRecoveryOperation = 'rerun-ingestion';

export interface CustomerRecoveryBlocker {
  readonly kind: CustomerRecoveryBlockerKind;
  readonly summary: string;
  /** Domain operation offered to the operator, if preconditions hold. */
  readonly operation: CustomerRecoveryOperation | null;
  /** Why no operation is offered, for read-only explanation. */
  readonly preconditionNote: string | null;
}

export interface CustomerRecoveryDossier {
  readonly identity: {
    readonly dedupeKey: string;
    readonly displayName: string | null;
    readonly email: string | null;
    readonly handle: string | null;
    readonly stage: string;
    readonly overrideStage: string | null;
    readonly sources: readonly string[];
    readonly certifiedAt: string | null;
    readonly activityAt: string | null;
    readonly userId: string | null;
    readonly creatorProfileId: string | null;
    readonly leadId: string | null;
    readonly waitlistEntryId: string | null;
  };
  /** Account facts — plan/subscription is separate from admission. */
  readonly account: {
    readonly userStatus: string | null;
    readonly plan: string | null;
    readonly isPro: boolean;
    /** Stripe-backed paying; Pro grants alone do not count. */
    readonly isPaying: boolean;
    readonly deletedAt: string | null;
  } | null;
  /** Management authority — a claimed profile linked to the account. */
  readonly authority: {
    readonly profileClaimed: boolean;
    readonly claimedAt: string | null;
    readonly isVerified: boolean;
    readonly ingestionStatus: string;
    readonly lastIngestionError: string | null;
    readonly hasSpotifySource: boolean;
  } | null;
  /** Admission — waitlist state is a separate fact from payment. */
  readonly admission: {
    readonly status: string;
    readonly approvedAt: string | null;
    readonly invitedAt: string | null;
    readonly signedUpAt: string | null;
  } | null;
  readonly connections: { readonly activeSocialLinks: number };
  readonly launch: {
    readonly releaseCount: number;
    readonly latestReleaseTitle: string | null;
  } | null;
  readonly recentOperations: readonly {
    readonly type: string;
    readonly result: string | null;
    readonly failureReason: string | null;
    readonly createdAt: string;
  }[];
  readonly blocker: CustomerRecoveryBlocker;
}

export interface CustomerRecoveryMatch {
  readonly dedupeKey: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly handle: string | null;
  readonly stage: string;
}

export interface CustomerRecoveryResult {
  readonly search: string;
  readonly matches: readonly CustomerRecoveryMatch[];
  readonly dossier: CustomerRecoveryDossier | null;
  readonly error: 'unavailable' | null;
  readonly generatedAt: string;
}

/**
 * Diagnose the evidenced blocker. A failed ingestion is the one demonstrated
 * recurring, reversible problem this surface repairs; an in-flight run or a
 * missing Spotify source produces a read-only explanation instead of an
 * action, so retry cannot duplicate work.
 */
export function deriveCustomerBlocker(input: {
  readonly ingestionStatus: string | null;
  readonly lastIngestionError: string | null;
  readonly hasSpotifySource: boolean;
}): CustomerRecoveryBlocker {
  if (input.ingestionStatus === 'failed') {
    if (!input.hasSpotifySource) {
      return {
        kind: 'ingestion-missing-source',
        summary:
          input.lastIngestionError ??
          'Artist ingestion failed and no Spotify source is linked.',
        operation: null,
        preconditionNote:
          'No Spotify URL or artist ID is linked to this profile, so ingestion cannot be re-run. Link a Spotify artist on the creator record first.',
      };
    }
    return {
      kind: 'ingestion-failed',
      summary: input.lastIngestionError ?? 'Artist ingestion failed.',
      operation: 'rerun-ingestion',
      preconditionNote: null,
    };
  }
  if (
    input.ingestionStatus === 'pending' ||
    input.ingestionStatus === 'processing'
  ) {
    return {
      kind: 'ingestion-in-flight',
      summary: 'Artist ingestion is already queued or running.',
      operation: null,
      preconditionNote:
        'An ingestion run is already in flight; re-running now could duplicate work. Wait for it to finish and re-check the result.',
    };
  }
  return {
    kind: 'none',
    summary: 'No evidenced blocker.',
    operation: null,
    preconditionNote: null,
  };
}

/** Prefer an explicit or exact identifier match; require selection if fuzzy. */
export function selectRecoveryMatch(
  contacts: readonly Pick<
    CanonicalContactListRow,
    | 'dedupeKey'
    | 'email'
    | 'handle'
    | 'userId'
    | 'creatorProfileId'
    | 'leadId'
    | 'waitlistEntryId'
  >[],
  search: string,
  key?: string | null
): string | null {
  if (contacts.length === 0) return null;
  if (key && contacts.some(c => c.dedupeKey === key)) return key;
  const needle = search.trim().toLowerCase();
  if (needle) {
    const exact = contacts.find(c =>
      [
        c.email,
        c.handle,
        c.userId,
        c.creatorProfileId,
        c.leadId,
        c.waitlistEntryId,
      ].some(field => field?.toLowerCase() === needle)
    );
    if (exact) return exact.dedupeKey;
    // A raw identifier that didn't text-match any contact may still be an
    // exact dedupe key (e.g. pasted from another admin surface).
    if (contacts.some(c => c.dedupeKey === needle)) return needle;
  }
  return contacts.length === 1 ? (contacts[0]?.dedupeKey ?? null) : null;
}

const iso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

export async function getCustomerRecovery(
  search: string,
  key?: string | null
): Promise<CustomerRecoveryResult> {
  const trimmed = search.trim();
  const generatedAt = new Date().toISOString();
  if (!trimmed && !key) {
    return {
      search: trimmed,
      matches: [],
      dossier: null,
      error: null,
      generatedAt,
    };
  }

  let contacts: CanonicalContactListRow[];
  try {
    ({ contacts } = await getCanonicalContacts({
      page: 1,
      pageSize: 8,
      search: trimmed || key || '',
      throwOnError: true,
    }));
  } catch (error) {
    await captureError('Error loading customer recovery matches', error, {
      search: trimmed,
      key,
    });
    return {
      search: trimmed,
      matches: [],
      dossier: null,
      error: 'unavailable',
      generatedAt,
    };
  }

  const matches: CustomerRecoveryMatch[] = contacts.map(c => ({
    dedupeKey: c.dedupeKey,
    displayName: c.displayName,
    email: c.email,
    handle: c.handle,
    stage: c.stage,
  }));
  const selectedKey = selectRecoveryMatch(contacts, trimmed, key);
  const selected = contacts.find(c => c.dedupeKey === selectedKey);
  if (!selected) {
    return {
      search: trimmed,
      matches,
      dossier: null,
      error: null,
      generatedAt,
    };
  }

  try {
    const dossier = await buildDossier(selected);
    return {
      search: trimmed,
      matches,
      dossier,
      error: null,
      generatedAt,
    };
  } catch (error) {
    await captureError('Error building customer recovery dossier', error, {
      search: trimmed,
      key,
      dedupeKey: selected.dedupeKey,
    });
    return {
      search: trimmed,
      matches,
      dossier: null,
      error: 'unavailable',
      generatedAt,
    };
  }
}

async function buildDossier(
  contact: CanonicalContactListRow
): Promise<CustomerRecoveryDossier> {
  const [
    userRow,
    waitlistRow,
    profileRow,
    linkCountRow,
    releaseCountRow,
    latestReleaseRows,
  ] = await Promise.all([
    contact.userId
      ? db
          .select({
            userStatus: users.userStatus,
            plan: users.plan,
            isPro: users.isPro,
            stripeSubscriptionId: users.stripeSubscriptionId,
            email: users.email,
            deletedAt: users.deletedAt,
          })
          .from(users)
          .where(eq(users.id, contact.userId))
          .limit(1)
      : Promise.resolve([]),
    contact.waitlistEntryId
      ? db
          .select({
            status: waitlistEntries.status,
            approvedAt: waitlistEntries.approvedAt,
            invitedAt: waitlistEntries.invitedAt,
            signedUpAt: waitlistEntries.signedUpAt,
          })
          .from(waitlistEntries)
          .where(eq(waitlistEntries.id, contact.waitlistEntryId))
          .limit(1)
      : Promise.resolve([]),
    contact.creatorProfileId
      ? db
          .select({
            claimedAt: creatorProfiles.claimedAt,
            isVerified: creatorProfiles.isVerified,
            ingestionStatus: creatorProfiles.ingestionStatus,
            lastIngestionError: creatorProfiles.lastIngestionError,
            spotifyId: creatorProfiles.spotifyId,
            spotifyUrl: creatorProfiles.spotifyUrl,
            usernameNormalized: creatorProfiles.usernameNormalized,
          })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, contact.creatorProfileId))
          .limit(1)
      : Promise.resolve([]),
    contact.creatorProfileId
      ? db
          .select({ value: count() })
          .from(socialLinks)
          .where(
            and(
              eq(socialLinks.creatorProfileId, contact.creatorProfileId),
              eq(socialLinks.isActive, true),
              eq(socialLinks.state, 'active')
            )
          )
      : Promise.resolve([]),
    contact.creatorProfileId
      ? db
          .select({ value: count() })
          .from(discogReleases)
          .where(eq(discogReleases.creatorProfileId, contact.creatorProfileId))
      : Promise.resolve([]),
    contact.creatorProfileId
      ? db
          .select({
            title: discogReleases.title,
          })
          .from(discogReleases)
          .where(eq(discogReleases.creatorProfileId, contact.creatorProfileId))
          .orderBy(desc(discogReleases.releaseDate))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const profile = profileRow[0] ?? null;
  const auditUsername = profile?.usernameNormalized?.trim();
  const auditSpotifyId = profile?.spotifyId?.trim();
  const auditIdentity = or(
    auditUsername ? eq(ingestAuditLogs.handle, auditUsername) : undefined,
    auditSpotifyId ? eq(ingestAuditLogs.spotifyId, auditSpotifyId) : undefined
  );
  const recentOperations = auditIdentity
    ? await db
        .select({
          type: ingestAuditLogs.type,
          result: ingestAuditLogs.result,
          failureReason: ingestAuditLogs.failureReason,
          createdAt: ingestAuditLogs.createdAt,
        })
        .from(ingestAuditLogs)
        .where(auditIdentity)
        .orderBy(desc(ingestAuditLogs.createdAt))
        .limit(5)
    : [];

  const user = userRow[0] ?? null;
  const waitlist = waitlistRow[0] ?? null;
  const hasSpotifySource = Boolean(
    profile?.spotifyId?.trim() || profile?.spotifyUrl?.trim()
  );

  return {
    identity: {
      dedupeKey: contact.dedupeKey,
      displayName: contact.displayName,
      email: contact.email,
      handle: contact.handle,
      stage: contact.stage,
      overrideStage: contact.overrideStage,
      sources: contact.sources,
      certifiedAt: iso(contact.certifiedAt),
      activityAt: iso(contact.activityAt),
      userId: contact.userId,
      creatorProfileId: contact.creatorProfileId,
      leadId: contact.leadId,
      waitlistEntryId: contact.waitlistEntryId,
    },
    account: user
      ? {
          userStatus: user.userStatus,
          plan: user.plan,
          isPro: user.isPro === true,
          isPaying:
            user.stripeSubscriptionId != null &&
            !isInternalOrTestAccountEmail(user.email),
          deletedAt: iso(user.deletedAt),
        }
      : null,
    authority: profile
      ? {
          profileClaimed: profile.claimedAt != null,
          claimedAt: iso(profile.claimedAt),
          isVerified: profile.isVerified === true,
          ingestionStatus: profile.ingestionStatus,
          lastIngestionError: profile.lastIngestionError,
          hasSpotifySource,
        }
      : null,
    admission: waitlist
      ? {
          status: waitlist.status,
          approvedAt: iso(waitlist.approvedAt),
          invitedAt: iso(waitlist.invitedAt),
          signedUpAt: iso(waitlist.signedUpAt),
        }
      : null,
    connections: { activeSocialLinks: Number(linkCountRow[0]?.value ?? 0) },
    launch: contact.creatorProfileId
      ? {
          releaseCount: Number(releaseCountRow[0]?.value ?? 0),
          latestReleaseTitle: latestReleaseRows[0]?.title ?? null,
        }
      : null,
    recentOperations: recentOperations.map(op => ({
      type: op.type,
      result: op.result,
      failureReason: op.failureReason,
      createdAt: op.createdAt.toISOString(),
    })),
    blocker: deriveCustomerBlocker({
      ingestionStatus: profile?.ingestionStatus ?? null,
      lastIngestionError: profile?.lastIngestionError ?? null,
      hasSpotifySource,
    }),
  };
}
