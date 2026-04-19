import { and, desc, eq, isNull } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createUniqueSourceLinkCode,
  isSafeAudienceSourceDestinationUrl,
} from '@/lib/audience/source-links';
import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import {
  audienceSourceGroups,
  audienceSourceLinks,
} from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  AUDIENCE_SOURCE_PAGE_SIZE,
  buildAudienceSourceErrorResponse,
  buildAudienceSourceUtmParams,
  NO_STORE_HEADERS,
  parseAudienceSourcePayload,
  resolveAudienceSourceDestinationUrl,
  withAudienceSourceShortLink,
} from '../source-route-helpers';

const getSourceLinksQuerySchema = z.object({
  profileId: z.string().uuid(),
});

const createSourceLinkSchema = z.object({
  profileId: z.string().uuid(),
  sourceGroupId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  sourceType: z.string().trim().min(1).max(40).default('qr'),
  destinationKind: z.string().trim().min(1).max(40).default('profile'),
  destinationId: z.string().trim().max(200).optional(),
  destinationUrl: z
    .string()
    .url()
    .refine(
      isSafeAudienceSourceDestinationUrl,
      'Invalid source destination URL'
    )
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { searchParams } = new URL(request.url);
      const parsedQuery = getSourceLinksQuerySchema.safeParse({
        profileId: searchParams.get('profileId'),
      });
      if (!parsedQuery.success) {
        return buildAudienceSourceErrorResponse('Invalid profileId', 400);
      }
      const { profileId } = parsedQuery.data;

      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { links: [] },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const links = await tx
        .select()
        .from(audienceSourceLinks)
        .where(
          and(
            eq(audienceSourceLinks.creatorProfileId, profileId),
            isNull(audienceSourceLinks.archivedAt)
          )
        )
        .orderBy(desc(audienceSourceLinks.createdAt))
        .limit(AUDIENCE_SOURCE_PAGE_SIZE);

      return NextResponse.json(
        {
          links: links.map(withAudienceSourceShortLink),
        },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('Audience source links fetch failed', {
      route: '/api/dashboard/audience/source-links',
      method: 'GET',
      error,
    });
    await captureError('Audience source links fetch failed', error, {
      route: '/api/dashboard/audience/source-links',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Unable to load source links' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const parsed = await parseAudienceSourcePayload(
        request,
        createSourceLinkSchema,
        'Invalid source link payload'
      );
      if (parsed.response) {
        return parsed.response;
      }

      const {
        profileId,
        sourceGroupId,
        name,
        sourceType,
        destinationKind,
        destinationId,
        destinationUrl,
      } = parsed.data;

      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return buildAudienceSourceErrorResponse('Profile not found', 404);
      }

      let sourceGroupName = name;
      if (sourceGroupId) {
        const [group] = await tx
          .select({
            id: audienceSourceGroups.id,
            name: audienceSourceGroups.name,
          })
          .from(audienceSourceGroups)
          .where(
            and(
              eq(audienceSourceGroups.id, sourceGroupId),
              eq(audienceSourceGroups.creatorProfileId, profileId),
              isNull(audienceSourceGroups.archivedAt)
            )
          )
          .limit(1);

        if (!group) {
          return buildAudienceSourceErrorResponse(
            'Source group not found',
            404
          );
        }

        sourceGroupName = group.name;
      }

      const resolvedDestinationUrl =
        destinationUrl ??
        (await resolveAudienceSourceDestinationUrl(tx, profileId));
      const code = await createUniqueSourceLinkCode(tx, name);
      const now = new Date();
      const [link] = await tx
        .insert(audienceSourceLinks)
        .values({
          creatorProfileId: profileId,
          sourceGroupId: sourceGroupId ?? null,
          code,
          name,
          sourceType,
          destinationKind,
          destinationId: destinationId ?? null,
          destinationUrl: resolvedDestinationUrl,
          utmParams: buildAudienceSourceUtmParams(sourceGroupName, name, {
            source: sourceType === 'qr' ? 'qr_code' : sourceType,
            medium: sourceType === 'qr' ? 'print' : sourceType,
          }),
          metadata: {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!link) {
        throw new Error('Source link insert returned no row');
      }

      return NextResponse.json(
        { link: withAudienceSourceShortLink(link) },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('Audience source link create failed', {
      route: '/api/dashboard/audience/source-links',
      method: 'POST',
      error,
    });
    await captureError('Audience source link create failed', error, {
      route: '/api/dashboard/audience/source-links',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Unable to create source link' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
