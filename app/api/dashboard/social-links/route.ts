import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { creatorProfiles, socialLinks, users } from '@/lib/db/schema';
import { flags } from '@/lib/env';
import { redis } from '@/lib/redis';

type DbSocialLink = typeof socialLinks.$inferSelect;

export async function GET(req: Request) {
  if (!flags.feature_social_links) {
    return NextResponse.json({ error: 'Not enabled' }, { status: 404 });
  }
  try {
    return await withDbSession(async clerkUserId => {
      const url = new URL(req.url);
      const profileId = url.searchParams.get('profileId');
      if (!profileId) {
        return NextResponse.json(
          { error: 'Missing profileId' },
          { status: 400 }
        );
      }

      const cacheKey = `social_links:${profileId}`;
      const cached = await redis.get<DbSocialLink[]>(cacheKey);
      if (cached) {
        const [profile] = await db
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .innerJoin(users, eq(users.id, creatorProfiles.userId))
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              eq(users.clerkId, clerkUserId)
            )
          )
          .limit(1);
        if (!profile) {
          return NextResponse.json(
            { error: 'Profile not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ links: cached }, { status: 200 });
      }

      const rows = await db
        .select({
          profileId: creatorProfiles.id,
          linkId: socialLinks.id,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          isActive: socialLinks.isActive,
          displayText: socialLinks.displayText,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .leftJoin(
          socialLinks,
          eq(socialLinks.creatorProfileId, creatorProfiles.id)
        )
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .orderBy(socialLinks.sortOrder);

      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }

      const links = rows
        .filter(r => r.linkId !== null)
        .map(r => ({
          id: r.linkId!,
          platform: r.platform!,
          platformType: r.platformType!,
          url: r.url!,
          sortOrder: r.sortOrder!,
          isActive: r.isActive!,
          displayText: r.displayText,
        }));

      await redis.set(cacheKey, links, { ex: 60 });

      return NextResponse.json({ links }, { status: 200 });
    });
  } catch (error) {
    console.error('Error fetching social links:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  if (!flags.feature_social_links) {
    return NextResponse.json({ error: 'Not enabled' }, { status: 404 });
  }
  try {
    return await withDbSession(async clerkUserId => {
      const body = (await req.json().catch(() => null)) as {
        profileId?: string;
        links?: Array<{
          platform: string;
          platformType?: string;
          url: string;
          sortOrder?: number;
          isActive?: boolean;
          displayText?: string;
        }>;
      } | null;

      const profileId = body?.profileId;
      const links = body?.links ?? [];
      if (!profileId) {
        return NextResponse.json(
          { error: 'Missing profileId' },
          { status: 400 }
        );
      }

      // Verify the profile belongs to the authenticated user
      const [profile] = await db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }

      // Delete existing links
      await db
        .delete(socialLinks)
        .where(eq(socialLinks.creatorProfileId, profileId));

      // Insert new links
      if (links.length > 0) {
        const insertPayload = links.map((l, idx) => ({
          creatorProfileId: profileId,
          platform: l.platform,
          platformType: l.platformType ?? l.platform,
          url: l.url,
          sortOrder: l.sortOrder ?? idx,
          isActive: l.isActive ?? true,
          displayText: l.displayText || null,
        }));

        await db.insert(socialLinks).values(insertPayload);
      }

      await redis.del(`social_links:${profileId}`);

      return NextResponse.json({ ok: true }, { status: 200 });
    });
  } catch (error) {
    console.error('Error updating social links:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
