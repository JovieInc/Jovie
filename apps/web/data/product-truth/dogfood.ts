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

export const DOGFOOD_RECEIPT_QUERIES: readonly DogfoodReceiptQuery[] = [
  {
    id: 'dogfood-tim-human-link-clicks-90d',
    claimId: 'dogfood.tim.human-link-clicks-90d',
    capabilityId: 'smart-links',
    unit: 'link clicks',
    population:
      'jov.ie/tim, is_bot=false, 90 days ending measuredAt; includes founder and team traffic',
    sql: `select count(*) from click_events ce join creator_profiles cp on cp.id = ce.creator_profile_id where ${TIM} and ce.is_bot = false and ce.created_at >= now() - interval '90 days'`,
    statement: value =>
      `${value.toLocaleString('en-US')} human link clicks on jov.ie/tim in 90 days`,
  },
  {
    id: 'dogfood-tim-active-subscribers',
    claimId: 'dogfood.tim.active-subscribers',
    capabilityId: 'artist-notifications',
    unit: 'subscribers',
    population: 'jov.ie/tim notification subscriptions not unsubscribed',
    sql: `select count(*) from notification_subscriptions ns join creator_profiles cp on cp.id = ns.creator_profile_id where ${TIM} and ns.unsubscribed_at is null`,
    statement: value =>
      `${value.toLocaleString('en-US')} people subscribed to updates on jov.ie/tim`,
  },
  {
    id: 'dogfood-tim-known-contacts',
    claimId: 'dogfood.tim.known-contacts',
    capabilityId: 'artist-profiles',
    unit: 'contacts',
    population:
      'jov.ie/tim audience members identified by email (anonymous visitors excluded)',
    sql: `select count(*) from audience_members am join creator_profiles cp on cp.id = am.creator_profile_id where ${TIM} and am.type = 'email'`,
    statement: value =>
      `${value.toLocaleString('en-US')} known contacts captured by jov.ie/tim`,
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
