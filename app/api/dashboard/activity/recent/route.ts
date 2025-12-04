import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  audienceMembers,
  clickEvents,
  creatorProfiles,
  users,
} from '@/lib/db/schema';

const querySchema = z.object({
  profileId: z.string().uuid(),
  limit: z.preprocess(val => Number(val ?? 5), z.number().int().min(1).max(20)),
});

const ACTION_ICONS: Record<string, string> = {
  listen: '🎧',
  social: '📸',
  tip: '💸',
  other: '🔗',
};

const ACTION_PHRASES: Record<string, string> = {
  listen: 'tapped a listen link',
  social: 'clicked a social destination',
  tip: 'sent a tip',
  other: 'clicked a link',
};

export async function GET(request: NextRequest) {
  try {
    return await withDbSession(async clerkUserId => {
      const { searchParams } = new URL(request.url);
      const parsed = querySchema.safeParse({
        profileId: searchParams.get('profileId'),
        limit: searchParams.get('limit') ?? undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid activity request' },
          { status: 400 }
        );
      }

      const { profileId, limit } = parsed.data;

      const rows = await db
        .select({
          id: clickEvents.id,
          linkType: clickEvents.linkType,
          createdAt: clickEvents.createdAt,
          audienceMemberId: clickEvents.audienceMemberId,
          memberDisplayName: audienceMembers.displayName,
          memberType: audienceMembers.type,
          city: clickEvents.city,
          country: clickEvents.country,
        })
        .from(clickEvents)
        .leftJoin(
          audienceMembers,
          eq(clickEvents.audienceMemberId, audienceMembers.id)
        )
        .innerJoin(
          creatorProfiles,
          eq(clickEvents.creatorProfileId, creatorProfiles.id)
        )
        .innerJoin(users, eq(creatorProfiles.userId, users.id))
        .where(
          and(eq(users.clerkId, clerkUserId), eq(creatorProfiles.id, profileId))
        )
        .orderBy(desc(clickEvents.createdAt))
        .limit(limit);

      const activities = rows.map(row => {
        const actorLabel =
          row.memberDisplayName ||
          (row.memberType === 'email'
            ? 'Email subscriber'
            : row.memberType === 'sms'
              ? 'SMS subscriber'
              : row.memberType === 'spotify'
                ? 'Spotify fan'
                : row.memberType === 'customer'
                  ? 'Customer'
                  : `Visitor ${row.audienceMemberId?.slice(0, 4) ?? '—'}`);
        const locationParts = [row.city, row.country].filter(Boolean);
        const locationLabel = locationParts.length
          ? ` from ${locationParts.join(', ')}`
          : '';
        const phrase = ACTION_PHRASES[row.linkType] ?? 'interacted with a link';
        const icon = ACTION_ICONS[row.linkType] ?? '✨';

        return {
          id: row.id,
          description: `${actorLabel} ${phrase}${locationLabel}`,
          icon,
          timestamp: row.createdAt.toISOString(),
        };
      });

      return NextResponse.json({ activities }, { status: 200 });
    });
  } catch (error) {
    console.error('[Dashboard Activity] Error loading recent actions', error);
    return NextResponse.json(
      { error: 'Failed to load activity' },
      { status: 500 }
    );
  }
}
