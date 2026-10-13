import type { Claim } from './registry';

/**
 * Dogfood proof generator contract (JOV-7750).
 *
 * Each receipt is one read-only production query about Jovie's own profiles.
 * `pnpm proof:dogfood` runs them through `scripts/db/prod-read.mjs` and
 * writes `dogfood-receipts.gen.json`; this module turns that file into proof
 * items and measured claims. A receipt whose count is zero is not written:
 * the claim hides instead of rendering a weak or placeholder number.
 */

export const DOGFOOD_RECEIPTS_SCHEMA = 'jovie.dogfood-receipts/v1';

/** Measured claims expire this many days after their measurement. */
export const DOGFOOD_RECEIPT_TTL_DAYS = 30;

export const DOGFOOD_RECEIPTS_SOURCE =
  'apps/web/data/product-truth/dogfood-receipts.gen.json' as const;

export interface DogfoodReceiptQuery {
  readonly id: string;
  readonly claimId: string;
  readonly capabilityId: string;
  readonly unit: string;
  readonly population: string;
  /** One read statement returning a single integer column. */
  readonly sql: string;
  readonly statement: (value: number) => string;
}

const TIM = "cp.username_normalized = 'tim'";

/**
 * Internal traffic (JOV-7794): Jovie staff are admins or hold a jov.ie or
 * timwhite.co address. Their emails and every IP any of their sessions
 * used are excluded, so a receipt counts outside people only.
 */
const INTERNAL_USERS =
  "select u.better_auth_user_id from users u where u.is_admin or split_part(lower(u.email), '@', 2) in ('jov.ie', 'timwhite.co')";
const INTERNAL_EMAILS =
  "select lower(u.email) from users u where u.is_admin or split_part(lower(u.email), '@', 2) in ('jov.ie', 'timwhite.co')";
const INTERNAL_IPS = `select s.ip_address from ba_sessions s where s.ip_address is not null and s.user_id in (${INTERNAL_USERS})`;

function externalEmail(column: string): string {
  return `coalesce(split_part(lower(${column}), '@', 2), '') not in ('jov.ie', 'timwhite.co') and coalesce(lower(${column}), '') not in (${INTERNAL_EMAILS})`;
}

function externalIp(column: string): string {
  return `(${column} is null or ${column} not in (${INTERNAL_IPS}))`;
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString('en-US')} ${value === 1 ? one : many}`;
}

export const DOGFOOD_RECEIPT_QUERIES: readonly DogfoodReceiptQuery[] = [
  {
    id: 'dogfood-tim-human-link-clicks-90d',
    claimId: 'dogfood.tim.human-link-clicks-90d',
    capabilityId: 'smart-links',
    unit: 'link clicks',
    population:
      'jov.ie/tim, is_bot=false, 90 days ending measuredAt; excludes IPs used by Jovie staff sessions',
    sql: `select count(*) from click_events ce join creator_profiles cp on cp.id = ce.creator_profile_id where ${TIM} and ce.is_bot = false and ce.created_at >= now() - interval '90 days' and ${externalIp('ce.ip_address')}`,
    statement: value =>
      `${count(value, 'human link click', 'human link clicks')} on jov.ie/tim in 90 days`,
  },
  {
    id: 'dogfood-tim-active-subscribers',
    claimId: 'dogfood.tim.active-subscribers',
    capabilityId: 'artist-notifications',
    unit: 'subscribers',
    population:
      'jov.ie/tim notification subscriptions not unsubscribed; excludes Jovie staff emails and IPs',
    sql: `select count(*) from notification_subscriptions ns join creator_profiles cp on cp.id = ns.creator_profile_id where ${TIM} and ns.unsubscribed_at is null and ${externalEmail('ns.email')} and ${externalIp('ns.ip_address')}`,
    statement: value =>
      `${count(value, 'person', 'people')} subscribed to updates on jov.ie/tim`,
  },
  {
    id: 'dogfood-tim-known-contacts',
    claimId: 'dogfood.tim.known-contacts',
    capabilityId: 'artist-profiles',
    unit: 'contacts',
    population:
      'jov.ie/tim audience members identified by email; excludes anonymous visitors and Jovie staff emails',
    sql: `select count(*) from audience_members am join creator_profiles cp on cp.id = am.creator_profile_id where ${TIM} and am.type = 'email' and ${externalEmail('am.email')}`,
    statement: value =>
      `${count(value, 'known contact', 'known contacts')} captured by jov.ie/tim`,
  },
];

export interface DogfoodReceipt {
  readonly id: string;
  readonly claimId: string;
  readonly capabilityId: string;
  readonly statement: string;
  readonly value: number;
  readonly unit: string;
  readonly reproducingQuery: string;
  readonly population: string;
}

export interface DogfoodReceiptsFile {
  readonly schema: typeof DOGFOOD_RECEIPTS_SCHEMA;
  readonly measuredAt: string;
  readonly generator: string;
  readonly receipts: readonly DogfoodReceipt[];
}

/**
 * Parse `prod-read.mjs` output (`psql -A`: BEGIN, header, value, row count,
 * COMMIT) into the single integer it returned.
 */
export function parseProdReadCount(output: string): number {
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const header = lines.findIndex(line => line === 'count');
  const value = header >= 0 ? lines[header + 1] : undefined;
  if (!value || !/^\d+$/u.test(value)) {
    throw new Error(`prod-read returned no count: ${output.slice(0, 200)}`);
  }
  return Number(value);
}

/** Build the receipts file; zero counts are dropped, never rendered. */
export function buildDogfoodReceipts(
  counts: ReadonlyMap<string, number>,
  measuredAt: string,
  queries: readonly DogfoodReceiptQuery[] = DOGFOOD_RECEIPT_QUERIES
): DogfoodReceiptsFile {
  const receipts = queries.flatMap(query => {
    const value = counts.get(query.id);
    if (value === undefined || value <= 0) return [];
    return [
      {
        id: query.id,
        claimId: query.claimId,
        capabilityId: query.capabilityId,
        statement: query.statement(value),
        value,
        unit: query.unit,
        reproducingQuery: query.sql,
        population: query.population,
      },
    ];
  });
  return {
    schema: DOGFOOD_RECEIPTS_SCHEMA,
    measuredAt,
    generator: 'pnpm proof:dogfood',
    receipts,
  };
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Measured claims for the product-truth registry, one per receipt. */
export function dogfoodClaims(file: DogfoodReceiptsFile): Claim[] {
  return file.receipts.map(receipt => ({
    id: receipt.claimId,
    capabilityId: receipt.capabilityId,
    statement: receipt.statement,
    kind: 'metric',
    source: 'measured',
    citation: `${DOGFOOD_RECEIPTS_SOURCE}#${receipt.id} (${file.measuredAt})`,
    validUntil: addDays(file.measuredAt, DOGFOOD_RECEIPT_TTL_DAYS),
  }));
}
