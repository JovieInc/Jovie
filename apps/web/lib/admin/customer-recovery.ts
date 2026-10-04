import 'server-only';

import { and, count, desc, eq, or, sql } from 'drizzle-orm';
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

export interface CustomerRecoveryDossier {
  readonly identity: {
    readonly displayName: string | null;
    readonly email: string | null;
    readonly handle: string | null;
    readonly stage: string;
    readonly sources: readonly string[];
    readonly userId: string | null;
    readonly creatorProfileId: string | null;
  };
  readonly account: {
    readonly plan: string | null;
    readonly isPro: boolean;
    readonly isPaying: boolean;
  } | null;
  readonly authority: {
    readonly profileClaimed: boolean;
    readonly isVerified: boolean;
    readonly ingestionStatus: string;
    readonly lastIngestionError: string | null;
    readonly hasSpotifySource: boolean;
  } | null;
  readonly admission: {
    readonly status: string;
  } | null;
  readonly connections: { readonly activeSocialLinks: number };
  readonly launch: {
    readonly releaseCount: number;
  } | null;
  readonly recentOperations: readonly {
    readonly type: string;
    readonly result: string | null;
    readonly failureReason: string | null;
    readonly createdAt: string;
  }[];
  readonly blocker: ReturnType<typeof deriveCustomerBlocker>;
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

export function deriveCustomerBlocker(input: {
  readonly ingestionStatus: string | null;
  readonly lastIngestionError: string | null;
  readonly hasSpotifySource: boolean;
}) {
  if (input.ingestionStatus === 'failed') {
    if (!input.hasSpotifySource) {
      return {
        kind: 'ingestion-missing-source',
        summary:
          input.lastIngestionError ??
          'Artist ingestion failed and no Spotify source is linked.',
        operation: null,
        preconditionNote: 'Link a Spotify artist before retrying ingestion.',
      } as const;
    }
    return {
      kind: 'ingestion-failed',
      summary: input.lastIngestionError ?? 'Artist ingestion failed.',
      operation: 'rerun-ingestion',
      preconditionNote: null,
    } as const;
  }
  if (
    input.ingestionStatus === 'pending' ||
    input.ingestionStatus === 'processing'
  ) {
    return {
      kind: 'ingestion-in-flight',
      summary: 'Artist ingestion is already queued or running.',
      operation: null,
      preconditionNote: 'Wait for the current ingestion run to finish.',
    } as const;
  }
  return {
    kind: 'none',
    summary: 'No evidenced blocker.',
    operation: null,
    preconditionNote: null,
  } as const;
}

export function selectRecoveryMatch(
  contacts: readonly CanonicalContactListRow[],
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
    if (contacts.some(c => c.dedupeKey === needle)) return needle;
  }
  return contacts.length === 1 ? (contacts[0]?.dedupeKey ?? null) : null;
}

export async function getCustomerRecovery(
  search: string,
  key?: string | null
): Promise<CustomerRecoveryResult> {
  const trimmed = search.trim();
  const generatedAt = new Date().toISOString();
  const result = (
    matches: CustomerRecoveryMatch[],
    dossier: CustomerRecoveryDossier | null,
    error: 'unavailable' | null
  ): CustomerRecoveryResult => ({
    search: trimmed,
    matches,
    dossier,
    error,
    generatedAt,
  });
  if (!trimmed && !key) return result([], null, null);

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
    return result([], null, 'unavailable');
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
  if (!selected) return result(matches, null, null);

  try {
    const dossier = await buildDossier(selected);
    return result(matches, dossier, null);
  } catch (error) {
    await captureError('Error building customer recovery dossier', error, {
      search: trimmed,
      key,
      dedupeKey: selected.dedupeKey,
    });
    return result(matches, null, 'unavailable');
  }
}

async function buildDossier(
  contact: CanonicalContactListRow
): Promise<CustomerRecoveryDossier> {
  const [userRow, waitlistRow, profileRow, linkCountRow, releaseRows] =
    await Promise.all([
      contact.userId
        ? db
            .select({
              plan: users.plan,
              isPro: users.isPro,
              stripeSubscriptionId: users.stripeSubscriptionId,
              email: users.email,
            })
            .from(users)
            .where(eq(users.id, contact.userId))
            .limit(1)
        : Promise.resolve([]),
      contact.waitlistEntryId
        ? db
            .select({
              status: waitlistEntries.status,
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
            .select({
              value: sql<number>`count(*) over()`,
            })
            .from(discogReleases)
            .where(
              eq(discogReleases.creatorProfileId, contact.creatorProfileId)
            )
            .orderBy(desc(discogReleases.releaseDate))
            .limit(1)
        : Promise.resolve([]),
    ]);

  const profile = profileRow[0] ?? null;
  const recentOperations = profile
    ? await db
        .select({
          type: ingestAuditLogs.type,
          result: ingestAuditLogs.result,
          failureReason: ingestAuditLogs.failureReason,
          createdAt: ingestAuditLogs.createdAt,
        })
        .from(ingestAuditLogs)
        .where(
          or(
            ...(profile.usernameNormalized
              ? [eq(ingestAuditLogs.handle, profile.usernameNormalized)]
              : []),
            ...(profile.spotifyId
              ? [eq(ingestAuditLogs.spotifyId, profile.spotifyId)]
              : [])
          )
        )
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
      displayName: contact.displayName,
      email: contact.email,
      handle: contact.handle,
      stage: contact.stage,
      sources: contact.sources,
      userId: contact.userId,
      creatorProfileId: contact.creatorProfileId,
    },
    account: user
      ? {
          plan: user.plan,
          isPro: user.isPro === true,
          isPaying:
            user.stripeSubscriptionId != null &&
            !isInternalOrTestAccountEmail(user.email),
        }
      : null,
    authority: profile
      ? {
          profileClaimed: profile.claimedAt != null,
          isVerified: profile.isVerified === true,
          ingestionStatus: profile.ingestionStatus,
          lastIngestionError: profile.lastIngestionError,
          hasSpotifySource,
        }
      : null,
    admission: waitlist ? { status: waitlist.status } : null,
    connections: { activeSocialLinks: Number(linkCountRow[0]?.value ?? 0) },
    launch: contact.creatorProfileId
      ? {
          releaseCount: Number(releaseRows[0]?.value ?? 0),
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
