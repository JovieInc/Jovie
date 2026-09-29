import 'server-only';

import { and, desc, eq, max, ne } from 'drizzle-orm';
import { invalidateSocialLinksCache } from '@/lib/cache';
import { type DbOrTransaction, db } from '@/lib/db';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema/auth';
import {
  baAccounts,
  baPasskeys,
  baSessions,
  baUsers,
} from '@/lib/db/schema/better-auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type SocialLinkSnapshotEntry,
  securityEvents,
  socialLinkSnapshots,
} from '@/lib/db/schema/security';

/** Account security helpers (JOV-6600). See docs on each export. */

export const SECURITY_EVENT_TYPES = {
  PANIC: 'panic',
  LINKS_RESTORED: 'links_restored',
} as const;

export const SNAPSHOT_REASONS = {
  UPDATE: 'update',
  PANIC: 'panic',
  PRE_RESTORE: 'pre_restore',
} as const;

export type SnapshotReason =
  (typeof SNAPSHOT_REASONS)[keyof typeof SNAPSHOT_REASONS];

function toSnapshotEntry(link: {
  platform: string;
  platformType: string | null;
  url: string;
  displayText: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
  state: string | null;
  sourceType: string | null;
  sourcePlatform: string | null;
}): SocialLinkSnapshotEntry {
  return {
    platform: link.platform,
    platformType: link.platformType,
    url: link.url,
    displayText: link.displayText,
    sortOrder: link.sortOrder,
    isActive: link.isActive,
    state: link.state,
    sourceType: link.sourceType,
    sourcePlatform: link.sourcePlatform,
  };
}

/** Capture the profile's current link set as a restorable snapshot. */
export async function captureSocialLinksSnapshot(
  tx: DbOrTransaction,
  options: {
    creatorProfileId: string;
    reason: SnapshotReason;
    createdByUserId?: string | null;
  }
): Promise<string | null> {
  const links = await tx
    .select({
      platform: socialLinks.platform,
      platformType: socialLinks.platformType,
      url: socialLinks.url,
      displayText: socialLinks.displayText,
      sortOrder: socialLinks.sortOrder,
      isActive: socialLinks.isActive,
      state: socialLinks.state,
      sourceType: socialLinks.sourceType,
      sourcePlatform: socialLinks.sourcePlatform,
      version: socialLinks.version,
    })
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, options.creatorProfileId));

  const version = links.reduce((acc, link) => Math.max(acc, link.version), 0);

  const [snapshot] = await tx
    .insert(socialLinkSnapshots)
    .values({
      creatorProfileId: options.creatorProfileId,
      version,
      links: links.map(toSnapshotEntry),
      reason: options.reason,
      createdByUserId: options.createdByUserId ?? null,
    })
    .returning({ id: socialLinkSnapshots.id });

  return snapshot?.id ?? null;
}

export interface SecurityOverview {
  email: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  passkeyCount: number;
  activeSessionCount: number;
  recentSessions: {
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    lastActiveAt: string;
  }[];
  recentEvents: {
    id: string;
    type: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }[];
}

/** Load the protections/activity data shown on the security card. */
export async function getSecurityOverview(
  appUserId: string
): Promise<SecurityOverview | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      betterAuthUserId: users.betterAuthUserId,
    })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);

  if (!user) return null;

  const betterAuthUserId = user.betterAuthUserId;
  const sessions = betterAuthUserId
    ? await db
        .select({
          id: baSessions.id,
          ipAddress: baSessions.ipAddress,
          userAgent: baSessions.userAgent,
          createdAt: baSessions.createdAt,
          updatedAt: baSessions.updatedAt,
          expiresAt: baSessions.expiresAt,
        })
        .from(baSessions)
        .where(eq(baSessions.userId, betterAuthUserId))
        .orderBy(desc(baSessions.updatedAt))
        .limit(10)
    : [];

  const now = Date.now();
  const activeSessions = sessions.filter(
    session => session.expiresAt.getTime() > now
  );

  const [passkeys, accounts, events] = betterAuthUserId
    ? await Promise.all([
        db
          .select({ id: baPasskeys.id })
          .from(baPasskeys)
          .where(eq(baPasskeys.userId, betterAuthUserId)),
        db
          .select({ providerId: baAccounts.providerId })
          .from(baAccounts)
          .where(eq(baAccounts.userId, betterAuthUserId)),
        db
          .select({
            id: securityEvents.id,
            type: securityEvents.type,
            createdAt: securityEvents.createdAt,
            metadata: securityEvents.metadata,
          })
          .from(securityEvents)
          .where(eq(securityEvents.userId, appUserId))
          .orderBy(desc(securityEvents.createdAt))
          .limit(20),
      ])
    : [[], [], []];

  const baUser = betterAuthUserId
    ? await db
        .select({ emailVerified: baUsers.emailVerified })
        .from(baUsers)
        .where(eq(baUsers.id, betterAuthUserId))
        .limit(1)
        .then(rows => rows[0])
    : undefined;

  return {
    email: user.email,
    emailVerified: Boolean(baUser?.emailVerified),
    hasPassword: accounts.some(account => account.providerId === 'credential'),
    passkeyCount: passkeys.length,
    activeSessionCount: activeSessions.length,
    recentSessions: sessions.map(session => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.updatedAt.toISOString(),
    })),
    recentEvents: events.map(event => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt.toISOString(),
      metadata: event.metadata ?? {},
    })),
  };
}

export interface ContainmentResult {
  sessionsRevoked: number;
  linksFrozen: number;
  profilesFrozen: number;
  eventId: string | null;
}

/**
 * Panic containment (JOV-6600). Snapshots each owned profile's links
 * first (so the pre-panic set stays revertable), freezes them, revokes
 * all sessions last so a partial failure never strands the legitimate
 * user, and writes an audited `panic` security event.
 */
export async function executeAccountContainment(options: {
  appUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<ContainmentResult> {
  const { appUserId } = options;

  const [user] = await db
    .select({
      id: users.id,
      betterAuthUserId: users.betterAuthUserId,
    })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  const profiles = await db
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, appUserId));

  let linksFrozen = 0;

  for (const profile of profiles) {
    // Snapshot BEFORE freezing so the pre-panic state stays revertable.
    await captureSocialLinksSnapshot(db, {
      creatorProfileId: profile.id,
      reason: SNAPSHOT_REASONS.PANIC,
      createdByUserId: appUserId,
    });

    const frozen = await db
      .update(socialLinks)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(socialLinks.creatorProfileId, profile.id))
      .returning({ id: socialLinks.id });

    linksFrozen += frozen.length;

    if (frozen.length > 0) {
      await invalidateSocialLinksCache(profile.id, profile.usernameNormalized);
    }
  }

  let sessionsRevoked = 0;
  if (user.betterAuthUserId) {
    const revoked = await db
      .delete(baSessions)
      .where(eq(baSessions.userId, user.betterAuthUserId))
      .returning({ id: baSessions.id });
    sessionsRevoked = revoked.length;
  }

  const [event] = await db
    .insert(securityEvents)
    .values({
      userId: appUserId,
      type: SECURITY_EVENT_TYPES.PANIC,
      metadata: {
        sessionsRevoked,
        linksFrozen,
        profilesFrozen: profiles.length,
      },
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
    })
    .returning({ id: securityEvents.id });

  return {
    sessionsRevoked,
    linksFrozen,
    profilesFrozen: profiles.length,
    eventId: event?.id ?? null,
  };
}

export interface RestoreResult {
  restoredCount: number;
  version: number;
}

/**
 * One-click revert of a profile's links to a known-good snapshot.
 * Captures the current set as a `pre_restore` snapshot first, so the
 * revert itself is reversible. Audited via a `links_restored` event.
 */
export async function restoreSocialLinksSnapshot(options: {
  appUserId: string;
  profileId: string;
  snapshotId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<RestoreResult> {
  const { appUserId, profileId, snapshotId } = options;

  const profile = await getAuthenticatedProfile(db, profileId, appUserId);
  if (!profile) {
    throw new Error('Profile not found');
  }

  const [snapshot] = await db
    .select()
    .from(socialLinkSnapshots)
    .where(eq(socialLinkSnapshots.id, snapshotId))
    .limit(1);

  if (!snapshot || snapshot.creatorProfileId !== profileId) {
    throw new Error('Snapshot not found');
  }

  await captureSocialLinksSnapshot(db, {
    creatorProfileId: profileId,
    reason: SNAPSHOT_REASONS.PRE_RESTORE,
    createdByUserId: appUserId,
  });

  const [versionRow] = await db
    .select({ value: max(socialLinks.version) })
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profileId));
  const nextVersion = (versionRow?.value ?? 0) + 1;

  // Replace only user-managed rows; ingested rows are left in place and
  // just get their version bumped (same policy as the PUT route).
  await db
    .delete(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        ne(socialLinks.sourceType, 'ingested')
      )
    );

  // Ingested rows were left in place above; restoring them again would
  // collide with the active-url unique index. Only user-managed entries
  // are reinserted.
  const entries = (snapshot.links ?? []).filter(
    entry => entry.sourceType !== 'ingested'
  );
  if (entries.length > 0) {
    await db.insert(socialLinks).values(
      entries.map(entry => ({
        creatorProfileId: profileId,
        platform: entry.platform,
        platformType: entry.platformType ?? 'other',
        url: entry.url,
        displayText: entry.displayText,
        sortOrder: entry.sortOrder ?? 0,
        isActive: entry.isActive ?? true,
        state: (entry.state === 'suggested' || entry.state === 'rejected'
          ? entry.state
          : 'active') as 'active' | 'suggested' | 'rejected',
        sourceType: (entry.sourceType === 'admin' ? 'admin' : 'manual') as
          | 'manual'
          | 'admin',
        sourcePlatform: entry.sourcePlatform,
        version: nextVersion,
      }))
    );
  }

  await db
    .update(socialLinks)
    .set({ version: nextVersion, updatedAt: new Date() })
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        eq(socialLinks.sourceType, 'ingested')
      )
    );

  await db.insert(securityEvents).values({
    userId: appUserId,
    type: SECURITY_EVENT_TYPES.LINKS_RESTORED,
    metadata: {
      profileId,
      snapshotId,
      snapshotVersion: snapshot.version,
      restoredCount: entries.length,
      newVersion: nextVersion,
    },
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
  });

  await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

  return { restoredCount: entries.length, version: nextVersion };
}

export async function listSocialLinkSnapshots(options: {
  appUserId: string;
  profileId: string;
}): Promise<
  {
    id: string;
    version: number;
    reason: string;
    linkCount: number;
    createdAt: string;
  }[]
> {
  const profile = await getAuthenticatedProfile(
    db,
    options.profileId,
    options.appUserId
  );
  if (!profile) {
    throw new Error('Profile not found');
  }

  const rows = await db
    .select({
      id: socialLinkSnapshots.id,
      version: socialLinkSnapshots.version,
      reason: socialLinkSnapshots.reason,
      links: socialLinkSnapshots.links,
      createdAt: socialLinkSnapshots.createdAt,
    })
    .from(socialLinkSnapshots)
    .where(eq(socialLinkSnapshots.creatorProfileId, options.profileId))
    .orderBy(desc(socialLinkSnapshots.createdAt))
    .limit(25);

  return rows.map(row => ({
    id: row.id,
    version: row.version,
    reason: row.reason,
    linkCount: row.links?.length ?? 0,
    createdAt: row.createdAt.toISOString(),
  }));
}

export {
  computeSecurityScore,
  type SecurityScoreFactor,
  type SecurityScoreInput,
} from './score';
