import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL, getProfileUrl } from '@/constants/domains';
import { createUniqueSourceLinkCode } from '@/lib/audience/source-links';
import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import {
  audienceSourceGroups,
  audienceSourceLinks,
} from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { slugify } from '@/lib/utm/build-url';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const AUDIENCE_SOURCE_PAGE_SIZE = 100;

const createSourceLinkSchema = z.object({
  profileId: z.string().uuid(),
  sourceGroupId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  sourceType: z.string().trim().min(1).max(40).default('qr'),
  destinationKind: z.string().trim().min(1).max(40).default('profile'),
  destinationId: z.string().trim().max(200).optional(),
  destinationUrl: z.string().url().optional(),
});

function buildDefaultUtmParams(name: string) {
  return {
    source: 'qr_code',
    medium: 'print',
    campaign: slugify(name),
    content: slugify(name),
  };
}

function buildShortLinkUrl(code: string): string {
  return new URL(`/s/${code}`, BASE_URL).toString();
}

async function parseJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error('Malformed JSON');
  }
}

export async function GET(request: NextRequest) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const { searchParams } = new URL(request.url);
      const profileId = searchParams.get('profileId');
      if (!profileId) {
        return NextResponse.json(
          { error: 'Missing profileId' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

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
        .where(eq(audienceSourceLinks.creatorProfileId, profileId))
        .orderBy(desc(audienceSourceLinks.createdAt))
        .limit(AUDIENCE_SOURCE_PAGE_SIZE);

      return NextResponse.json(
        {
          links: links.map(link => ({
            ...link,
            shortUrl: buildShortLinkUrl(link.code),
          })),
        },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
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
      let body: unknown;
      try {
        body = await parseJsonBody(request);
      } catch {
        return NextResponse.json(
          { error: 'Malformed JSON' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const parsed = createSourceLinkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid source link payload' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
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
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      if (sourceGroupId) {
        const [group] = await tx
          .select({ id: audienceSourceGroups.id })
          .from(audienceSourceGroups)
          .where(
            and(
              eq(audienceSourceGroups.id, sourceGroupId),
              eq(audienceSourceGroups.creatorProfileId, profileId)
            )
          )
          .limit(1);

        if (!group) {
          return NextResponse.json(
            { error: 'Source group not found' },
            { status: 404, headers: NO_STORE_HEADERS }
          );
        }
      }

      const [profileRow] = await tx
        .select({ username: creatorProfiles.username })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId))
        .limit(1);

      const resolvedDestinationUrl =
        destinationUrl ??
        (profileRow?.username ? getProfileUrl(profileRow.username) : BASE_URL);
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
          utmParams: buildDefaultUtmParams(name),
          metadata: {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!link) {
        throw new Error('Source link insert returned no row');
      }

      return NextResponse.json(
        { link: { ...link, shortUrl: buildShortLinkUrl(link.code) } },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
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
