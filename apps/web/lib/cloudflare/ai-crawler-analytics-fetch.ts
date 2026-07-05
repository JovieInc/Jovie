import 'server-only';

import {
  matchAiCrawlerFromUserAgent,
  TRACKED_AI_CRAWLER_BOTS,
} from '@/lib/cloudflare/ai-crawler-bots';
import {
  getCloudflareZoneId,
  queryCloudflareGraphql,
} from '@/lib/cloudflare/graphql-client';

const ZONE_AI_CRAWLER_QUERY = `
  query AiCrawlerZoneAnalytics(
    $zoneTag: string!
    $start: Time!
    $end: Time!
    $limit: uint64!
  ) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequestsAdaptiveGroups(
          filter: {
            datetime_geq: $start
            datetime_leq: $end
            requestSource: "eyeball"
          }
          limit: $limit
        ) {
          count
          dimensions {
            datetimeHour
            clientRequestPath
            userAgent
          }
        }
      }
    }
  }
`;

export interface RawAiCrawlerRequestRow {
  readonly count: number;
  readonly path: string;
  readonly userAgent: string;
  readonly hour: string;
}

interface CloudflareAdaptiveGroup {
  readonly count: number;
  readonly dimensions: {
    readonly datetimeHour?: string | null;
    readonly clientRequestPath?: string | null;
    readonly userAgent?: string | null;
  };
}

interface CloudflareZoneQueryResult {
  readonly viewer: {
    readonly zones: readonly {
      readonly httpRequestsAdaptiveGroups: readonly CloudflareAdaptiveGroup[];
    }[];
  };
}

export async function fetchZoneAiCrawlerRows(
  start: Date,
  end: Date
): Promise<readonly RawAiCrawlerRequestRow[]> {
  const zoneId = getCloudflareZoneId();
  if (!zoneId) {
    throw new Error('CLOUDFLARE_ZONE_ID is not configured');
  }

  const data = await queryCloudflareGraphql<CloudflareZoneQueryResult>(
    ZONE_AI_CRAWLER_QUERY,
    {
      zoneTag: zoneId,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: 10_000,
    }
  );

  const groups = data.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
  const rows: RawAiCrawlerRequestRow[] = [];

  for (const group of groups) {
    const bot = matchAiCrawlerFromUserAgent(group.dimensions.userAgent);
    if (!bot) {
      continue;
    }

    const path = group.dimensions.clientRequestPath?.trim() ?? '';
    const hour = group.dimensions.datetimeHour ?? start.toISOString();

    rows.push({
      count: group.count,
      path,
      userAgent: group.dimensions.userAgent ?? bot.userAgentPattern,
      hour,
    });
  }

  return rows;
}

export function getTrackedAiCrawlerBotIds(): readonly string[] {
  return TRACKED_AI_CRAWLER_BOTS.map(bot => bot.id);
}
