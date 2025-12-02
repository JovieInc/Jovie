import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { creatorProfiles, socialLinks, users } from '@/lib/db/schema';
import { isValidSocialPlatform } from '@/types';
// flags import removed - pre-launch

export async function GET(req: Request) {
  // Feature flag check removed - social links enabled by default
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

      // Verify the profile belongs to the authenticated user before checking cache
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

      return NextResponse.json(
        { links },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
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

const updateSocialLinksSchema = z.object({
  profileId: z.string().min(1),
  links: z
    .array(
      z.object({
        platform: z
          .string()
          .min(1)
          .refine(isValidSocialPlatform, { message: 'Invalid platform' }),
        platformType: z.string().min(1).optional(),
        url: z.string().min(1).max(2048),
        sortOrder: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
        displayText: z.string().max(256).optional(),
      })
    )
    .max(100)
    .optional(),
});

export async function PUT(req: Request) {
  // Feature flag check removed - social links enabled by default
  try {
    return await withDbSession(async clerkUserId => {
      const rawBody = await req.json().catch(() => null);
      if (rawBody == null || typeof rawBody !== 'object') {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      const parsed = updateSocialLinksSchema.safeParse(rawBody);
      if (!parsed.success) {
        const issues = parsed.error.issues;
        const hasInvalidPlatform = issues.some(
          issue => issue.message === 'Invalid platform'
        );
        const message = hasInvalidPlatform
          ? 'Invalid platform'
          : 'Invalid request body';
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const { profileId, links: parsedLinks } = parsed.data;
      const links = parsedLinks ?? [];
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

      // Validate URLs before proceeding
      const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
      for (const link of links) {
        try {
          const url = new URL(link.url);
          const protocol = url.protocol.toLowerCase();

          if (dangerousProtocols.includes(protocol)) {
            return NextResponse.json(
              {
                error: `Invalid URL protocol: ${protocol}. Only http: and https: are allowed.`,
              },
              { status: 400 }
            );
          }

          if (protocol !== 'http:' && protocol !== 'https:') {
            return NextResponse.json(
              {
                error: `Invalid URL protocol: ${protocol}. Only http: and https: are allowed.`,
              },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: `Invalid URL format: ${link.url}` },
            { status: 400 }
          );
        }
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

      return NextResponse.json(
        { ok: true },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
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
