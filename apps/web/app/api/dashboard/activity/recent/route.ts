import { and, desc, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import {
  audienceMembers,
  clickEvents,
  notificationSubscriptions,
} from '@/lib/db/schema';
import { logger } from '@/lib/utils/logger';
import { recentActivityQuerySchema } from '@/lib/validation/schemas';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const ACTION_ICONS: Record<string, string> = {
  listen: '🎧',
  social: '📸',
  tip: '💸',
  other: '🔗',
};

type ActivityRow = {
  id: string;
  description: string;
  icon: string;
  timestamp: string;
};

type ActorKind = 'subscriber' | 'spotify_fan' | 'customer' | 'someone';

function getActorKind(memberType: string | null): ActorKind {
  if (memberType === 'email' || memberType === 'sms') return 'subscriber';
  if (memberType === 'spotify') return 'spotify_fan';
  if (memberType === 'customer') return 'customer';
  return 'someone';
}

function getActorLabel(actor: ActorKind): string {
  if (actor === 'subscriber') return 'A subscriber';
  if (actor === 'spotify_fan') return 'A Spotify fan';
  if (actor === 'customer') return 'A customer';
  return 'Someone';
}

function safeDecodeLocationPart(value: string): string {
  if (!value) return value;
  const maybeEncoded = value.includes('%') || value.includes('+');
  if (!maybeEncoded) return value;
  try {
    return decodeURIComponent(value.replaceAll('+', ' '));
  } catch {
    return value;
  }
}

function formatLocation(parts: Array<string | null | undefined>): string {
  const filtered = (parts.filter(Boolean) as string[]).map(
    safeDecodeLocationPart
  );
  if (filtered.length === 0) return '';
  return ` from ${filtered.join(', ')}`;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function platformLabel(value: string | null): string {
  if (!value) return 'link';
  const normalized = value.toLowerCase();
  if (normalized === 'apple_music') return 'Apple Music';
  if (normalized === 'amazon_music') return 'Amazon Music';
  if (normalized === 'soundcloud') return 'SoundCloud';
  if (normalized === 'youtube') return 'YouTube';
  if (normalized === 'tiktok') return 'TikTok';
  if (normalized === 'instagram') return 'Instagram';
  if (normalized === 'spotify') return 'Spotify';
  return titleCase(value.replaceAll(/[_-]/g, ' '));
}

function getClickPhrase(linkType: string, target: string | null): string {
  if (linkType === 'listen') {
    return `clicked your ${platformLabel(target)} link`;
  }
  if (linkType === 'social') {
    return `visited your ${platformLabel(target)}`;
  }
  if (linkType === 'tip') {
    return 'sent a tip';
  }
  return 'clicked a link';
}

export async function GET(request: NextRequest) {
  try {
    return await withDbSession(async clerkUserId => {
      const { searchParams } = new URL(request.url);
      const parsed = recentActivityQuerySchema.safeParse({
        profileId: searchParams.get('profileId'),
        limit: searchParams.get('limit') ?? undefined,
        range: searchParams.get('range') ?? undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid activity request' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { profileId, limit, range } = parsed.data;

      const RANGE_MS_MAP: Record<string, number> = {
        '90d': 90 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
      };
      const rangeMs = RANGE_MS_MAP[range] ?? 7 * 24 * 60 * 60 * 1000;
      const since = new Date(Date.now() - rangeMs);

      // Verify user owns the profile
      const profile = await verifyProfileOwnership(db, profileId, clerkUserId);

      if (!profile) {
        return NextResponse.json(
          { activities: [] },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      const perSourceLimit = Math.min(20, Math.max(5, limit * 2));

      const [clickRows, visitRows, subscribeRows] = await Promise.all([
        db
          .select({
            id: clickEvents.id,
            linkType: clickEvents.linkType,
            createdAt: clickEvents.createdAt,
            memberType: audienceMembers.type,
            memberCity: audienceMembers.geoCity,
            memberCountry: audienceMembers.geoCountry,
            clickCity: clickEvents.city,
            clickCountry: clickEvents.country,
            target: drizzleSql<
              string | null
            >`(${clickEvents.metadata} ->> 'target')`,
          })
          .from(clickEvents)
          .leftJoin(
            audienceMembers,
            eq(clickEvents.audienceMemberId, audienceMembers.id)
          )
          .where(
            and(
              eq(clickEvents.creatorProfileId, profile.id),
              gte(clickEvents.createdAt, since)
            )
          )
          .orderBy(desc(clickEvents.createdAt))
          .limit(perSourceLimit),

        db
          .select({
            id: audienceMembers.id,
            memberType: audienceMembers.type,
            city: audienceMembers.geoCity,
            country: audienceMembers.geoCountry,
            lastSeenAt: audienceMembers.lastSeenAt,
          })
          .from(audienceMembers)
          .where(
            and(
              eq(audienceMembers.creatorProfileId, profile.id),
              gte(audienceMembers.lastSeenAt, since)
            )
          )
          .orderBy(desc(audienceMembers.lastSeenAt))
          .limit(perSourceLimit),

        db
          .select({
            id: notificationSubscriptions.id,
            createdAt: notificationSubscriptions.createdAt,
            countryCode: notificationSubscriptions.countryCode,
            city: notificationSubscriptions.city,
            channel: notificationSubscriptions.channel,
          })
          .from(notificationSubscriptions)
          .where(
            and(
              eq(notificationSubscriptions.creatorProfileId, profile.id),
              gte(notificationSubscriptions.createdAt, since)
            )
          )
          .orderBy(desc(notificationSubscriptions.createdAt))
          .limit(perSourceLimit),
      ]);

      const clickActivities: ActivityRow[] = clickRows.map(row => {
        const actor = getActorKind(row.memberType ?? null);
        const actorLabel = getActorLabel(actor);
        const locationLabel = formatLocation([
          row.clickCity ?? row.memberCity,
          row.clickCountry ?? row.memberCountry,
        ]);
        const phrase = getClickPhrase(row.linkType, row.target ?? null);
        const icon = ACTION_ICONS[row.linkType] ?? '✨';
        return {
          id: row.id,
          description: `${actorLabel}${locationLabel} ${phrase}.`,
          icon,
          timestamp: row.createdAt.toISOString(),
        };
      });

      const visitActivities: ActivityRow[] = visitRows
        .filter(row => Boolean(row.lastSeenAt))
        .map(row => {
          const actor = getActorKind(row.memberType ?? null);
          const actorLabel = getActorLabel(actor);
          const locationLabel = formatLocation([row.city, row.country]);
          const timestamp = (row.lastSeenAt as Date).toISOString();
          return {
            id: `visit:${row.id}:${timestamp}`,
            description: `${actorLabel}${locationLabel} visited your Jovie profile.`,
            icon: '👀',
            timestamp,
          };
        });

      const subscribeActivities: ActivityRow[] = subscribeRows.map(row => {
        const resolveLocationLabel = (): string => {
          if (row.city) return ` from ${safeDecodeLocationPart(row.city)}`;
          if (row.countryCode) return ` from ${row.countryCode.toUpperCase()}`;
          return '';
        };
        const locationLabel = resolveLocationLabel();
        return {
          id: `subscribe:${row.id}`,
          description: `Someone${locationLabel} just subscribed.`,
          icon: row.channel === 'sms' ? '📱' : '📩',
          timestamp: row.createdAt.toISOString(),
        };
      });

      const merged = [
        ...subscribeActivities,
        ...visitActivities,
        ...clickActivities,
      ]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit);

      return NextResponse.json(
        { activities: merged },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Dashboard Activity] Error loading recent actions', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to load activity' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
