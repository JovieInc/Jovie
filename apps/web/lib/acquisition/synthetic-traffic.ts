import { sql as drizzleSql } from 'drizzle-orm';

/**
 * Synthetic probe traffic (Lighthouse, Playwright monitors, crawlers) must not
 * count as a visit in any funnel. Prod had ~22k probe journeys against ~100-240
 * real visits a day. Probes are tagged at source: the synthetic Playwright
 * config sends SYNTHETIC_TRAFFIC_HEADER, and automation user agents are
 * recognised. The journey's first_touch gets `synthetic: true`, and funnel
 * queries filter on it.
 */
export const SYNTHETIC_TRAFFIC_HEADER = 'x-synthetic-monitoring';

const AUTOMATION_UA =
  /SyntheticMonitoring|HeadlessChrome|Lighthouse|Playwright|Puppeteer|PhantomJS|Pingdom|UptimeRobot|vercel-screenshot|bot|crawler|spider/i;

export function isSyntheticTraffic(headers: {
  get(name: string): string | null;
}): boolean {
  if (headers.get(SYNTHETIC_TRAFFIC_HEADER)) return true;
  return AUTOMATION_UA.test(headers.get('user-agent') ?? '');
}

/**
 * Historic probe fixtures (landing paths hit thousands of times by automation
 * before the source tag existed). Real visitors never land on these.
 */
export const SYNTHETIC_FIXTURE_LANDING =
  '^/(dualipa|testartist|nonexistent-artist)(/|\\?|$)';

/** SQL predicate for single-table queries on acquisition_journeys. */
export const realJourney = drizzleSql`(
  COALESCE(first_touch ->> 'synthetic', '') <> 'true'
  AND COALESCE(first_touch ->> 'landingPath', '') !~ ${SYNTHETIC_FIXTURE_LANDING}
)`;

/** Same predicate for a query that aliases acquisition_journeys as j. */
export const realJourneyJ = drizzleSql`(
  COALESCE(j.first_touch ->> 'synthetic', '') <> 'true'
  AND COALESCE(j.first_touch ->> 'landingPath', '') !~ ${SYNTHETIC_FIXTURE_LANDING}
)`;
