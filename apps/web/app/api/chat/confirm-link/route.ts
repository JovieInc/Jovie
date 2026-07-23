import * as Sentry from '@sentry/nextjs';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { syncPrimaryMusicUrlsFromSocialLinks } from '@/lib/db/social-links-sync';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import { getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import { httpUrlSchema } from '@/lib/validation/schemas/base';

const confirmLinkSchema = chatToolSchema({
  profileId: z.string().uuid(),
  platform: z.string().min(1),
  url: httpUrlSchema,
  normalizedUrl: httpUrlSchema,
  expectedVersion: z.number().int().min(1).optional(),
});

function linkVersionConflict(expectedVersion: number, currentVersion?: number) {
  return NextResponse.json(
    {
      error: 'Conflict: Link has been modified by another request',
      code: 'VERSION_CONFLICT',
      expectedVersion,
      currentVersion,
    },
    { status: 409, headers: NO_CACHE_HEADERS }
  );
}

/**
 * POST /api/chat/confirm-link
 *
 * Adds a social link to the artist's profile after chat confirmation.
 * Validates ownership, detects platform, and inserts the link.
 */
export async function POST(req: Request) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const parseResult = confirmLinkSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const { profileId, platform, normalizedUrl, expectedVersion } =
    parseResult.data;

  const urlValidation = validateSocialLinkUrl(normalizedUrl);
  if (!urlValidation.valid) {
    return NextResponse.json(
      { error: urlValidation.error ?? 'Invalid URL' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const detected = detectPlatform(normalizedUrl);
  if (!detected.isValid) {
    return NextResponse.json(
      { error: detected.error ?? 'Unsupported platform URL' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    return await withDbSessionTx(
      async tx => {
        const lockKey = `confirm-link:${detected.platform.id}`;
        await tx.execute(
          drizzleSql`SELECT pg_advisory_xact_lock(hashtext(${profileId}), hashtext(${lockKey}))`
        );

        // Better Auth resolves the app `users.id`; profile ownership uses the same
        // stable UUID and does not depend on the nullable legacy Clerk identity.
        const [profile] = await tx
          .select({
            id: creatorProfiles.id,
            internalUserId: creatorProfiles.userId,
          })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, profileId))
          .limit(1);

        if (!profile) {
          return NextResponse.json(
            { error: 'Profile not found' },
            { status: 404, headers: NO_CACHE_HEADERS }
          );
        }

        if (profile.internalUserId !== userId) {
          return NextResponse.json(
            { error: 'Unauthorized - not your profile' },
            { status: 403, headers: NO_CACHE_HEADERS }
          );
        }

        // Check for existing link with same platform (prevent duplicates)
        const [existingLink] = await tx
          .select({ id: socialLinks.id, version: socialLinks.version })
          .from(socialLinks)
          .where(
            and(
              eq(socialLinks.creatorProfileId, profileId),
              eq(socialLinks.platform, detected.platform.id)
            )
          )
          .limit(1);

        let linkId: string;
        let linkVersion: number;
        /** Distinguishes create vs overwrite for truthful client copy (JOV-3549). */
        let outcome: 'created' | 'updated';

        if (existingLink) {
          const currentVersion = existingLink.version ?? 1;
          if (
            expectedVersion !== undefined &&
            expectedVersion !== currentVersion
          ) {
            return linkVersionConflict(expectedVersion, currentVersion);
          }

          // Update existing link URL instead of creating duplicate
          const rows = await tx
            .update(socialLinks)
            .set({
              url: detected.normalizedUrl,
              isActive: true,
              state: 'active',
              version: currentVersion + 1,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(socialLinks.id, existingLink.id),
                eq(socialLinks.creatorProfileId, profileId),
                eq(socialLinks.version, currentVersion)
              )
            )
            .returning({ id: socialLinks.id, version: socialLinks.version });
          if (!rows[0]) {
            const [currentLink] = await tx
              .select({ version: socialLinks.version })
              .from(socialLinks)
              .where(
                and(
                  eq(socialLinks.id, existingLink.id),
                  eq(socialLinks.creatorProfileId, profileId)
                )
              )
              .limit(1);
            return linkVersionConflict(currentVersion, currentLink?.version);
          }
          linkId = rows[0].id;
          linkVersion = rows[0].version;
          outcome = 'updated';
        } else {
          if (expectedVersion !== undefined) {
            return linkVersionConflict(expectedVersion);
          }

          // Insert new social link
          const rows = await tx
            .insert(socialLinks)
            .values({
              creatorProfileId: profileId,
              platform: detected.platform.id,
              platformType: detected.platform.category,
              url: detected.normalizedUrl,
              displayText: null,
              sortOrder: 0,
              isActive: true,
              state: 'active',
              confidence: '1.00',
              sourceType: 'manual',
              version: 1,
            })
            .onConflictDoNothing()
            .returning({ id: socialLinks.id });
          if (!rows[0]) {
            const [currentLink] = await tx
              .select({ version: socialLinks.version })
              .from(socialLinks)
              .where(
                and(
                  eq(socialLinks.creatorProfileId, profileId),
                  eq(socialLinks.platform, detected.platform.id)
                )
              )
              .limit(1);
            return linkVersionConflict(0, currentLink?.version);
          }
          linkId = rows[0].id;
          linkVersion = 1;
          outcome = 'created';
        }

        await syncPrimaryMusicUrlsFromSocialLinks(tx, profileId);

        // Audit log
        const ipAddress = getClientIP(req);
        const userAgent = req.headers.get('user-agent');

        await tx.insert(chatAuditLog).values({
          userId: profile.internalUserId,
          creatorProfileId: profileId,
          action:
            outcome === 'created' ? 'add_social_link' : 'update_social_link',
          field: 'social_links',
          previousValue: null,
          newValue: JSON.stringify({
            platform: detected.platform.id,
            url: detected.normalizedUrl,
            outcome,
          }),
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        });

        return NextResponse.json(
          {
            success: true,
            platform: detected.platform.id,
            linkId,
            version: linkVersion,
            outcome,
          },
          { headers: NO_CACHE_HEADERS }
        );
      },
      { clerkUserId: userId }
    );
  } catch (error) {
    logger.error('[confirm-link] Error adding link:', error);
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat', operation: 'confirm-link' },
      extra: { userId, profileId, platform },
    });
    return NextResponse.json(
      { error: 'Failed to add link' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
