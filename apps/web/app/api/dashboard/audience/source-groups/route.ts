import { desc, eq } from 'drizzle-orm';
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

const createSourceGroupSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  sourceType: z.string().trim().min(1).max(40).default('qr'),
  destinationKind: z.string().trim().min(1).max(40).default('profile'),
  destinationId: z.string().trim().max(200).optional(),
  destinationUrl: z.string().url().optional(),
  linkNames: z.array(z.string().trim().min(1).max(120)).optional(),
});

function buildDefaultUtmParams(groupName: string, linkName: string) {
  return {
    source: 'qr_code',
    medium: 'print',
    campaign: slugify(groupName),
    content: slugify(linkName),
  };
}

function buildShortLinkUrl(code: string): string {
  const url = new URL(`/s/${code}`, BASE_URL);
  return url.toString();
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
          { groups: [] },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const groups = await tx
        .select()
        .from(audienceSourceGroups)
        .where(eq(audienceSourceGroups.creatorProfileId, profileId))
        .orderBy(desc(audienceSourceGroups.createdAt))
        .limit(100);

      return NextResponse.json({ groups }, { headers: NO_STORE_HEADERS });
    });
  } catch (error) {
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
      const parsed = createSourceGroupSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid source group payload' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
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
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const [profileRow] = await tx
        .select({ username: creatorProfiles.username })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId))
        .limit(1);

      const resolvedDestinationUrl =
        destinationUrl ??
        (profileRow?.username ? getProfileUrl(profileRow.username) : BASE_URL);

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
          utmParams: buildDefaultUtmParams(name, name),
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
            utmParams: buildDefaultUtmParams(name, linkName),
            metadata: { groupName: name },
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (link) {
          links.push({ ...link, shortUrl: buildShortLinkUrl(link.code) });
        }
      }

      return NextResponse.json(
        { group, links },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
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
