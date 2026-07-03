import {
  matchAiCrawlerFromUserAgent,
  TRACKED_AI_CRAWLER_BOTS,
  type AiCrawlerBotDefinition,
} from '@/lib/cloudflare/ai-crawler-bots';
import type { RawAiCrawlerRequestRow } from '@/lib/cloudflare/ai-crawler-analytics-fetch';
import type {
  AiCrawlerDailyPoint,
  AiCrawlerStat,
} from '@/types/ai-crawler-analytics';

const RESERVED_FIRST_SEGMENTS = new Set([
  'api',
  'app',
  'auth',
  'billing',
  'blog',
  'brand',
  'changelog',
  'demo',
  'download',
  'exp',
  'legal',
  'pricing',
  'r',
  'signin',
  'signup',
  'support',
  'waitlist',
  '_next',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

export interface ProfileHandleRow {
  readonly profileId: string;
  readonly usernameNormalized: string;
}

export interface ProfileAiCrawlerAggregate {
  readonly profileId: string;
  readonly totalRequests: number;
  readonly weeklyRequests: number;
  readonly crawlers: AiCrawlerStat[];
  readonly dailyTrend: AiCrawlerDailyPoint[];
}

interface MutableCrawlerTotals {
  readonly current: number;
  readonly previous: number;
}

interface MutableProfileBucket {
  readonly crawlers: Map<string, MutableCrawlerTotals>;
  readonly daily: Map<string, number>;
  readonly weekly: number;
  total: number;
}

function extractUsernameFromPath(path: string): string | null {
  if (!path || path === '/') {
    return null;
  }

  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const [firstSegment] = normalizedPath.split('/');
  if (!firstSegment) {
    return null;
  }

  const normalized = firstSegment.toLowerCase();
  if (RESERVED_FIRST_SEGMENTS.has(normalized)) {
    return null;
  }

  return normalized;
}

function toIsoDate(hourIso: string): string {
  const date = new Date(hourIso);
  if (Number.isNaN(date.getTime())) {
    return hourIso.slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function emptyBotTotals(): Map<string, MutableCrawlerTotals> {
  const map = new Map<string, MutableCrawlerTotals>();
  for (const bot of TRACKED_AI_CRAWLER_BOTS) {
    map.set(bot.id, { current: 0, previous: 0 });
  }
  return map;
}

function resolveBot(userAgent: string): AiCrawlerBotDefinition | null {
  return matchAiCrawlerFromUserAgent(userAgent);
}

export function attributeAiCrawlerRows(
  profiles: readonly ProfileHandleRow[],
  currentRows: readonly RawAiCrawlerRequestRow[],
  previousRows: readonly RawAiCrawlerRequestRow[],
  periodStart: Date,
  weeklyCutoff: Date
): ProfileAiCrawlerAggregate[] {
  const profileByUsername = new Map(
    profiles.map(profile => [profile.usernameNormalized, profile.profileId])
  );

  const buckets = new Map<string, MutableProfileBucket>();

  const ensureBucket = (profileId: string): MutableProfileBucket => {
    const existing = buckets.get(profileId);
    if (existing) {
      return existing;
    }

    const created: MutableProfileBucket = {
      crawlers: emptyBotTotals(),
      daily: new Map<string, number>(),
      weekly: 0,
      total: 0,
    };
    buckets.set(profileId, created);
    return created;
  };

  const ingest = (
    rows: readonly RawAiCrawlerRequestRow[],
    period: 'current' | 'previous'
  ) => {
    for (const row of rows) {
      const username = extractUsernameFromPath(row.path);
      if (!username) {
        continue;
      }

      const profileId = profileByUsername.get(username);
      if (!profileId) {
        continue;
      }

      const bot = resolveBot(row.userAgent);
      if (!bot) {
        continue;
      }

      const bucket = ensureBucket(profileId);
      const crawlerTotals = bucket.crawlers.get(bot.id);
      if (!crawlerTotals) {
        continue;
      }

      if (period === 'current') {
        crawlerTotals.current += row.count;
        bucket.total += row.count;

        const day = toIsoDate(row.hour);
        if (new Date(row.hour) >= periodStart) {
          bucket.daily.set(day, (bucket.daily.get(day) ?? 0) + row.count);
        }

        if (new Date(row.hour) >= weeklyCutoff) {
          bucket.weekly += row.count;
        }
      } else {
        crawlerTotals.previous += row.count;
      }
    }
  };

  ingest(currentRows, 'current');
  ingest(previousRows, 'previous');

  return [...buckets.entries()].map(([profileId, bucket]) => {
    const crawlers: AiCrawlerStat[] = TRACKED_AI_CRAWLER_BOTS.map(bot => {
      const totals = bucket.crawlers.get(bot.id) ?? { current: 0, previous: 0 };
      return {
        id: bot.id,
        name: bot.name,
        requests: totals.current,
        previousPeriodRequests: totals.previous,
      };
    })
      .filter(stat => stat.requests > 0 || stat.previousPeriodRequests > 0)
      .sort((left, right) => right.requests - left.requests);

    const dailyTrend: AiCrawlerDailyPoint[] = [...bucket.daily.entries()]
      .map(([date, requests]) => ({ date, requests }))
      .sort((left, right) => left.date.localeCompare(right.date));

    return {
      profileId,
      totalRequests: bucket.total,
      weeklyRequests: bucket.weekly,
      crawlers,
      dailyTrend,
    };
  });
}