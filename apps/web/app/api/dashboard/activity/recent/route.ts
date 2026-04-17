import { and, desc, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import type { DashboardActivityIcon } from '@/lib/activity/dashboard-feed';
import { renderAudienceEventSentence } from '@/lib/audience/activity-grammar';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import {
  audienceActions,
  audienceMembers,
  clickEvents,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import { toISOStringSafe } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import {
  formatLocationString,
  safeDecodeURIComponent,
} from '@/lib/utils/string-utils';
import { recentActivityQuerySchema } from '@/lib/validation/schemas';

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
} as const;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const ACTION_ICONS: Record<string, DashboardActivityIcon> = {
  listen: 'listen',
  social: 'social',
  tip: 'tip',
  other: 'link',
};

type ActivityType = 'click' | 'visit' | 'subscribe' | 'unknown';

type ActivityRow = {
  id: string;
  type: ActivityType;
  description: string;
  icon: DashboardActivityIcon;
  timestamp: string;
  href?: string;
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

function formatActivityLocation(
  parts: Array<string | null | undefined>
): string {
  const location = formatLocationString(parts);
  return location ? ` from ${location}` : '';
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

function getActivityIcon(eventType: string): DashboardActivityIcon {
  switch (eventType) {
    case 'profile_visited':
      return 'visit';
    case 'subscription_created':
      return 'email';
    case 'tip_sent':
    case 'tip_link_opened':
      return 'tip';
    case 'social_opened':
      return 'social';
    case 'content_checked_out':
      return 'listen';
    default:
      return 'link';
  }
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
          { status: 200, headers: CACHE_HEADERS }
        );
      }

      const perSourceLimit = Math.min(20, Math.max(5, limit * 2));

      const [actionRows, clickRows, visitRows, subscribeRows] =
        await Promise.all([
          db
            .select({
              id: audienceActions.id,
              audienceMemberId: audienceActions.audienceMemberId,
              label: audienceActions.label,
              eventType: audienceActions.eventType,
              verb: audienceActions.verb,
              confidence: audienceActions.confidence,
              sourceKind: audienceActions.sourceKind,
              sourceLabel: audienceActions.sourceLabel,
              objectType: audienceActions.objectType,
              objectId: audienceActions.objectId,
              objectLabel: audienceActions.objectLabel,
              clickEventId: audienceActions.clickEventId,
              platform: audienceActions.platform,
              properties: audienceActions.properties,
              context: audienceActions.context,
              timestamp: audienceActions.timestamp,
            })
            .from(audienceActions)
            .where(
              and(
                eq(audienceActions.creatorProfileId, profile.id),
                gte(audienceActions.timestamp, since)
              )
            )
            .orderBy(desc(audienceActions.timestamp))
            .limit(perSourceLimit),

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
              email: notificationSubscriptions.email,
              phone: notificationSubscriptions.phone,
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

      const structuredActivities: ActivityRow[] = actionRows.flatMap(row => {
        if (!row.timestamp) {
          return [];
        }

        const rendered = renderAudienceEventSentence(row);
        return {
          id: row.id,
          type: 'click' as const,
          description:
            rendered.kind === 'sentence' ? `${rendered.text}.` : row.label,
          icon: getActivityIcon(row.eventType),
          timestamp: toISOStringSafe(row.timestamp),
          href: APP_ROUTES.AUDIENCE,
        };
      });

      const structuredClickIds = new Set(
        actionRows
          .map(row => row.clickEventId)
          .filter((id): id is string => Boolean(id))
      );
      const structuredVisitMemberIds = new Set(
        actionRows
          .filter(row => row.eventType === 'profile_visited')
          .map(row => row.audienceMemberId)
      );
      const getStringProperty = (
        properties: Record<string, unknown> | null,
        key: string
      ) => {
        const value = properties?.[key];
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      };
      const getSubscriptionKey = (
        input: Readonly<{ email?: string | null; phone?: string | null }>
      ) => {
        if (input.email) return `email:${input.email.trim().toLowerCase()}`;
        if (input.phone) return `phone:${input.phone.trim()}`;
        return null;
      };
      const structuredSubscriptionKeys = new Set(
        actionRows
          .filter(row => row.eventType === 'subscription_created')
          .flatMap(row => [
            getSubscriptionKey({
              email: getStringProperty(row.properties, 'email'),
            }),
            getSubscriptionKey({
              phone: getStringProperty(row.properties, 'phone'),
            }),
          ])
          .filter((key): key is string => Boolean(key))
      );

      const clickActivities: ActivityRow[] = clickRows
        .filter(row => !structuredClickIds.has(row.id))
        .map(row => {
          const actor = getActorKind(row.memberType ?? null);
          const actorLabel = getActorLabel(actor);
          const locationLabel = formatActivityLocation([
            row.clickCity ?? row.memberCity,
            row.clickCountry ?? row.memberCountry,
          ]);
          const phrase = getClickPhrase(row.linkType, row.target ?? null);
          const icon = ACTION_ICONS[row.linkType] ?? 'link';
          return {
            id: row.id,
            type: 'click' as const,
            description: `${actorLabel}${locationLabel} ${phrase}.`,
            icon,
            timestamp: toISOStringSafe(row.createdAt),
            href: APP_ROUTES.AUDIENCE,
          };
        });

      const visitActivities: ActivityRow[] = visitRows
        .filter(row => !structuredVisitMemberIds.has(row.id))
        .filter(row => Boolean(row.lastSeenAt))
        .map(row => {
          const actor = getActorKind(row.memberType ?? null);
          const actorLabel = getActorLabel(actor);
          const locationLabel = formatActivityLocation([row.city, row.country]);
          // lastSeenAt is guaranteed non-null by the filter above
          const timestamp = toISOStringSafe(row.lastSeenAt! as Date | string);
          return {
            id: `visit:${row.id}:${timestamp}`,
            type: 'visit' as const,
            description: `${actorLabel}${locationLabel} visited your Jovie profile.`,
            icon: 'visit',
            timestamp,
            href: APP_ROUTES.AUDIENCE,
          };
        });

      const subscribeActivities: ActivityRow[] = subscribeRows
        .filter(row => {
          const subscriptionKey = getSubscriptionKey(row);
          return (
            !subscriptionKey || !structuredSubscriptionKeys.has(subscriptionKey)
          );
        })
        .map(row => {
          const resolveLocationLabel = (): string => {
            if (row.city) return ` from ${safeDecodeURIComponent(row.city)}`;
            if (row.countryCode)
              return ` from ${row.countryCode.toUpperCase()}`;
            return '';
          };
          const locationLabel = resolveLocationLabel();
          return {
            id: `subscribe:${row.id}`,
            type: 'subscribe' as const,
            description: `Someone${locationLabel} just subscribed.`,
            icon: row.channel === 'sms' ? 'sms' : 'email',
            timestamp: toISOStringSafe(row.createdAt),
            href: APP_ROUTES.SETTINGS_CONTACTS,
          };
        });

      const merged = [
        ...structuredActivities,
        ...subscribeActivities,
        ...visitActivities,
        ...clickActivities,
      ]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit);

      return NextResponse.json(
        { activities: merged },
        { status: 200, headers: CACHE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Dashboard Activity] Error loading recent actions', error);
    if (!(error instanceof Error && error.message === 'Unauthorized')) {
      await captureError('Recent activity fetch failed', error, {
        route: '/api/dashboard/activity/recent',
        method: 'GET',
      });
    }
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
