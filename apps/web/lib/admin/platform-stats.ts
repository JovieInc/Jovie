import 'server-only';

import {
  and,
  count,
  sql as drizzleSql,
  eq,
  isNotNull,
  ne,
  or,
} from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { db } from '@/lib/db';
import { clickEvents } from '@/lib/db/schema/analytics';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const PLATFORM_STATS_CACHE_SECONDS = 60 * 10;

interface LabelAggregate {
  readonly name: string;
  readonly count: number;
}

export interface AdminPlatformStats {
  readonly labelsOnPlatform: number;
  readonly labelBadges: readonly string[];
  readonly allLabelsAndDistributors: readonly string[];
  readonly totalUniqueVisitors: number;
  readonly dspClicksDriven: number;
  readonly contactsCaptured: number;
  readonly creatorsOnPlatform: number;
  readonly releasesTracked: number;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function buildLabelAggregates(
  values: readonly (string | null)[]
): LabelAggregate[] {
  const buckets = new Map<string, LabelAggregate>();

  for (const value of values) {
    if (!value) continue;

    const normalized = normalizeName(value);
    if (normalized.length === 0) continue;

    const key = normalized.toLocaleLowerCase('en-US');
    const existing = buckets.get(key);

    if (existing) {
      buckets.set(key, { ...existing, count: existing.count + 1 });
      continue;
    }

    buckets.set(key, { name: normalized, count: 1 });
  }

  return [...buckets.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
}

const getCachedAdminPlatformStats = unstable_cache(
  async (): Promise<AdminPlatformStats> => {
    const [
      labels,
      distributors,
      visitors,
      dspClicks,
      contacts,
      creators,
      releases,
    ] = await Promise.all([
      db
        .select({ value: discogReleases.label })
        .from(discogReleases)
        .where(
          and(isNotNull(discogReleases.label), ne(discogReleases.label, ''))
        ),
      db
        .select({ value: discogReleases.distributor })
        .from(discogReleases)
        .where(
          and(
            isNotNull(discogReleases.distributor),
            ne(discogReleases.distributor, '')
          )
        ),
      db.execute(drizzleSql<{ count: number }>`
          SELECT count(DISTINCT COALESCE(NULLIF(fingerprint, ''), lower(email), phone, id::text))::int AS count
          FROM audience_members
        `),
      db
        .select({ count: count() })
        .from(clickEvents)
        .where(
          and(
            eq(clickEvents.linkType, 'listen'),
            or(
              eq(clickEvents.isBot, false),
              drizzleSql`${clickEvents.isBot} IS NULL`
            )
          )
        ),
      db.execute(drizzleSql<{ email_count: number; phone_count: number }>`
          SELECT
            count(DISTINCT lower(email)) FILTER (WHERE email IS NOT NULL AND email <> '')::int AS email_count,
            count(DISTINCT phone) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int AS phone_count
          FROM notification_subscriptions
        `),
      db.select({ count: count() }).from(creatorProfiles),
      db.select({ count: count() }).from(discogReleases),
    ]);

    const combinedValues = [
      ...labels.map(entry => entry.value),
      ...distributors.map(entry => entry.value),
    ];

    const aggregates = buildLabelAggregates(combinedValues);
    const allNames = aggregates.map(entry => entry.name);

    return {
      labelsOnPlatform: allNames.length,
      labelBadges: allNames.slice(0, 3),
      allLabelsAndDistributors: allNames,
      totalUniqueVisitors: Number(visitors.rows[0]?.count ?? 0),
      dspClicksDriven: Number(dspClicks[0]?.count ?? 0),
      contactsCaptured:
        Number(contacts.rows[0]?.email_count ?? 0) +
        Number(contacts.rows[0]?.phone_count ?? 0),
      creatorsOnPlatform: Number(creators[0]?.count ?? 0),
      releasesTracked: Number(releases[0]?.count ?? 0),
    };
  },
  ['admin-platform-stats'],
  { revalidate: PLATFORM_STATS_CACHE_SECONDS }
);

export async function getAdminPlatformStats(): Promise<AdminPlatformStats> {
  return getCachedAdminPlatformStats();
}
