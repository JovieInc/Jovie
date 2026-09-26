import 'server-only';

import {
  and,
  desc,
  sql as drizzleSql,
  eq,
  inArray,
  or,
  type SQL,
} from 'drizzle-orm';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { adminAuditLog } from '@/lib/db/schema/admin';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { wrappedLinks } from '@/lib/db/schema/links';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import type { ReportTargetType } from '@/lib/validation/schemas/report';

export const ABUSE_REPORT_SOURCE = 'abuse_report';

export interface ModerationTakedownInput {
  readonly adminUserId: string;
  readonly targetType: ReportTargetType;
  readonly target: string;
  readonly reportId?: string;
  readonly reason?: string;
}

/** `{releaseSlug}--{profileId}` tail parse, mirroring `app/r/[slug]/page.tsx`. */
function profileIdFromSmartLinkSlug(slug: string): string | null {
  const i = slug.lastIndexOf('--');
  return i === -1 ? null : slug.slice(i + 2) || null;
}

async function disableWrappedLinks(where: SQL, now: Date) {
  const rows = await db
    .update(wrappedLinks)
    // Expiring a link makes getWrappedLink treat it as gone, so /out/<id>
    // and /go/<id> stop resolving everywhere. No schema change required.
    .set({ expiresAt: now })
    .where(where)
    .returning({ id: wrappedLinks.id });
  return rows.length;
}

/**
 * Apply an admin takedown (JOV-6599).
 *
 * - `wrapped_link`: expires the wrapped link so /out/<id> and /go/<id> 404.
 * - `profile` / `smart_link`: unpublishes the profile AND expires every
 *   wrapped link created by its owner/claimants, killing wrapped outbound
 *   destinations with the page.
 * - Marks matching pending abuse reports resolved and writes an
 *   `admin_audit_log` row for traceability.
 */
export async function applyModerationTakedown(input: ModerationTakedownInput) {
  const now = new Date();
  let profileId: string | null = null;
  let wrappedLinksDisabled = 0;

  if (input.targetType === 'wrapped_link') {
    wrappedLinksDisabled = await disableWrappedLinks(
      eq(wrappedLinks.shortId, input.target),
      now
    );
  } else if (input.targetType !== 'page') {
    const slugProfileId =
      input.targetType === 'smart_link'
        ? profileIdFromSmartLinkSlug(input.target)
        : null;

    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        userId: creatorProfiles.userId,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(
        slugProfileId
          ? eq(creatorProfiles.id, slugProfileId)
          : eq(
              creatorProfiles.usernameNormalized,
              input.target.toLowerCase().replace(/^@/, '')
            )
      )
      .limit(1);

    if (profile) {
      profileId = profile.id;
      await db
        .update(creatorProfiles)
        .set({ isPublic: false, updatedAt: now })
        .where(eq(creatorProfiles.id, profile.id));

      const claims = await db
        .select({ userId: userProfileClaims.userId })
        .from(userProfileClaims)
        .where(eq(userProfileClaims.creatorProfileId, profile.id));
      const ownerIds = new Set(claims.map(c => c.userId));
      if (profile.userId) ownerIds.add(profile.userId);
      if (ownerIds.size > 0) {
        wrappedLinksDisabled = await disableWrappedLinks(
          inArray(wrappedLinks.createdBy, [...ownerIds]),
          now
        );
      }

      await invalidateProfileCache(profile.usernameNormalized);
    }
  }

  // Resolve matching pending abuse reports (queue rows are feedback_items
  // with source='abuse_report'); 'dismissed' is the closed status there.
  const reportConditions = [
    eq(feedbackItems.source, ABUSE_REPORT_SOURCE),
    eq(feedbackItems.status, 'pending'),
    drizzleSql`${feedbackItems.context}->'report'->>'targetType' = ${input.targetType}`,
    drizzleSql`${feedbackItems.context}->'report'->>'target' = ${input.target}`,
  ];
  const resolvedReports = await db
    .update(feedbackItems)
    .set({ status: 'dismissed', dismissedAt: now, updatedAt: now })
    .where(
      input.reportId
        ? or(eq(feedbackItems.id, input.reportId), ...reportConditions)
        : and(...reportConditions)
    )
    .returning({ id: feedbackItems.id });

  await db.insert(adminAuditLog).values({
    adminUserId: input.adminUserId,
    action: 'moderation_takedown',
    metadata: {
      targetType: input.targetType,
      target: input.target,
      reportId: input.reportId ?? null,
      reason: input.reason ?? null,
      profileId,
      wrappedLinksDisabled,
      reportsResolved: resolvedReports.length,
    },
  });

  return {
    ok: true,
    profileId,
    wrappedLinksDisabled,
    reportsResolved: resolvedReports.length,
  };
}

/** Pending abuse/security reports for the admin moderation queue. */
export async function listAbuseReports(limit = 50) {
  return db
    .select({
      id: feedbackItems.id,
      message: feedbackItems.message,
      status: feedbackItems.status,
      context: feedbackItems.context,
      createdAt: feedbackItems.createdAt,
    })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.source, ABUSE_REPORT_SOURCE),
        eq(feedbackItems.status, 'pending')
      )
    )
    .orderBy(desc(feedbackItems.createdAt))
    .limit(limit);
}
