import { and, desc, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
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

const getSourceGroupsQuerySchema = z.object({
  profileId: z.string().uuid(),
});

const createSourceGroupSchema = z.object({
  profileId: z.string().uuid(),
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
  linkNames: z
    .array(z.string().trim().min(1).max(120))
    .max(AUDIENCE_SOURCE_PAGE_SIZE)
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { searchParams } = new URL(request.url);
      const parsedQuery = getSourceGroupsQuerySchema.safeParse({
        profileId: searchParams.get('profileId'),
      });
      if (!parsedQuery.success) {
        return buildAudienceSourceErrorResponse('Invalid profileId', 400);
      }
      const { profileId } = parsedQuery.data;

      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { groups: [] },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const groups = await tx
        .select()
        .from(audienceSourceGroups)
        .where(
          and(
            eq(audienceSourceGroups.creatorProfileId, profileId),
            isNull(audienceSourceGroups.archivedAt)
          )
        )
        .orderBy(desc(audienceSourceGroups.createdAt))
        .limit(AUDIENCE_SOURCE_PAGE_SIZE);

      return NextResponse.json({ groups }, { headers: NO_STORE_HEADERS });
    });
  } catch (error) {
    logger.error('Audience source groups fetch failed', {
      route: '/api/dashboard/audience/source-groups',
      method: 'GET',
      error,
    });
    await captureError('Audience source groups fetch failed', error, {
      route: '/api/dashboard/audience/source-groups',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Unable to load source groups' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const parsed = await parseAudienceSourcePayload(
        request,
        createSourceGroupSchema,
        'Invalid source group payload'
      );
      if (parsed.response) {
        return parsed.response;
      }

      const {
        profileId,
        name,
        sourceType,
        destinationKind,
        destinationId,
        destinationUrl,
        linkNames,
      } = parsed.data;

      const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
      if (!profile) {
        return buildAudienceSourceErrorResponse('Profile not found', 404);
      }

      const normalizedName = name.trim().toLowerCase();
      const lockKey = `${sourceType}:${normalizedName}`;
      await tx.execute(
        drizzleSql`SELECT pg_advisory_xact_lock(hashtext(${profileId}), hashtext(${lockKey}))`
      );

      const [existingGroup] = await tx
        .select()
        .from(audienceSourceGroups)
        .where(
          and(
            eq(audienceSourceGroups.creatorProfileId, profileId),
            eq(audienceSourceGroups.sourceType, sourceType),
            drizzleSql`lower(${audienceSourceGroups.name}) = ${normalizedName}`,
            isNull(audienceSourceGroups.archivedAt)
          )
        )
        .orderBy(desc(audienceSourceGroups.createdAt))
        .limit(1);

      if (existingGroup) {
        const existingLinks = await tx
          .select()
          .from(audienceSourceLinks)
          .where(
            and(
              eq(audienceSourceLinks.sourceGroupId, existingGroup.id),
              isNull(audienceSourceLinks.archivedAt)
            )
          )
          .orderBy(desc(audienceSourceLinks.createdAt))
          .limit(AUDIENCE_SOURCE_PAGE_SIZE);

        return NextResponse.json(
          {
            group: existingGroup,
            links: existingLinks.map(withAudienceSourceShortLink),
          },
          { headers: NO_STORE_HEADERS }
        );
      }

      const resolvedDestinationUrl =
        destinationUrl ??
        (await resolveAudienceSourceDestinationUrl(tx, profileId));

      const now = new Date();
      const [group] = await tx
        .insert(audienceSourceGroups)
        .values({
          creatorProfileId: profileId,
          name,
          sourceType,
          destinationKind,
          destinationId: destinationId ?? null,
          destinationUrl: resolvedDestinationUrl,
          utmParams: buildAudienceSourceUtmParams(name, name, {
            source: sourceType === 'qr' ? 'qr_code' : sourceType,
            medium: sourceType === 'qr' ? 'print' : sourceType,
          }),
          metadata: {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!group) {
        throw new Error('Source group insert returned no row');
      }

      const names = linkNames?.length ? linkNames : [name];
      const links = [];
      for (const linkName of names) {
        const code = await createUniqueSourceLinkCode(tx, linkName);
        const [link] = await tx
          .insert(audienceSourceLinks)
          .values({
            creatorProfileId: profileId,
            sourceGroupId: group.id,
            code,
            name: linkName,
            sourceType,
            destinationKind,
            destinationId: destinationId ?? null,
            destinationUrl: resolvedDestinationUrl,
            utmParams: buildAudienceSourceUtmParams(name, linkName, {
              source: sourceType === 'qr' ? 'qr_code' : sourceType,
              medium: sourceType === 'qr' ? 'print' : sourceType,
            }),
            metadata: { groupName: name },
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!link) {
          throw new Error(
            `Source link insert returned no row for "${linkName}"`
          );
        }
        links.push(withAudienceSourceShortLink(link));
      }

      return NextResponse.json(
        { group, links },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('Audience source group create failed', {
      route: '/api/dashboard/audience/source-groups',
      method: 'POST',
      error,
    });
    await captureError('Audience source group create failed', error, {
      route: '/api/dashboard/audience/source-groups',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Unable to create source group' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
