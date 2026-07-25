import 'server-only';

import { env } from '@/lib/env-server';
import { getRedis } from '@/lib/redis';
import {
  NAVIGATION_ITEM_IDS,
  NAVIGATION_LATENCY_BUCKETS,
  NAVIGATION_PLATFORMS,
  NAVIGATION_TELEMETRY_MAX_BATCH_SIZE,
  NAVIGATION_TELEMETRY_OWNER,
  NAVIGATION_TELEMETRY_SCHEMA_VERSION,
  NAVIGATION_VARIANTS,
  type NavigationItemId,
  type NavigationLatencyBucket,
  type NavigationPlatform,
  type NavigationTelemetryPayload,
  type NavigationVariant,
  navigationLatencyBucketUpperBoundMs,
  navigationTelemetryPayloadSchema,
} from '@/lib/tracking/navigation-telemetry-contract';

export const NAVIGATION_TELEMETRY_BASELINE_DAYS = 30;
export const NAVIGATION_TELEMETRY_MINIMUM_SAMPLE = 50;
export const NAVIGATION_TELEMETRY_RETENTION_DAYS = 35;
export const NAVIGATION_TELEMETRY_DEDUP_TTL_SECONDS = 24 * 60 * 60;
/**
 * Redis HyperLogLog is deliberately non-enumerable but approximate. Requiring
 * two estimates beyond k=50 makes estimation error fail toward suppression.
 */
export const NAVIGATION_TELEMETRY_CARDINALITY_SAFETY_MARGIN = 2;

const KEY_PREFIX = `navigation-telemetry:v${NAVIGATION_TELEMETRY_SCHEMA_VERSION}`;
const RETENTION_SECONDS = NAVIGATION_TELEMETRY_RETENTION_DAYS * 24 * 60 * 60;
const HEALTH_ATTEMPTS_FIELD = 'health|attempts';
const HEALTH_ACCEPTED_FIELD = 'health|accepted';
const HEALTH_DUPLICATES_FIELD = 'health|duplicates';
const HEALTH_UNKNOWN_ITEMS_FIELD = 'health|unknown_items';

/**
 * Dedupe claim and aggregate mutations execute as one Redis operation. If the
 * HTTP response is lost after Redis commits, a retry observes the dedupe key
 * and cannot increment the event aggregate twice.
 */
const RECORD_NAVIGATION_TELEMETRY_BATCH_SCRIPT = `
local results = {}
local eventIndex = 0

for keyIndex = 2, #KEYS, 4 do
  local argumentIndex = 4 + (eventIndex * 5)
  local dedupeKey = KEYS[keyIndex]
  local lifecycleKey = KEYS[keyIndex + 1]
  local segmentContributorsKey = KEYS[keyIndex + 2]
  local itemContributorsKey = KEYS[keyIndex + 3]
  local aggregateField = ARGV[argumentIndex]
  local unknownItem = ARGV[argumentIndex + 1]
  local eventName = ARGV[argumentIndex + 2]
  local contributionCapped = ARGV[argumentIndex + 3] == '1'
  local windowContributor = ARGV[argumentIndex + 4]
  local duplicate = redis.call('EXISTS', dedupeKey) == 1
  local lifecycleAllowed = true

  if contributionCapped and not duplicate then
    local impression = redis.call('HGET', lifecycleKey, 'impression')
    local activation = redis.call('HGET', lifecycleKey, 'activation')
    local outcome = redis.call('HGET', lifecycleKey, 'outcome')
    local shortReturn = redis.call('HGET', lifecycleKey, 'short_return')

    if eventName == 'impression' then
      lifecycleAllowed = impression == false
    elseif eventName == 'activation' then
      lifecycleAllowed = impression == '1' and activation == false
    elseif eventName == 'destination_ready' or eventName == 'drop_off' then
      lifecycleAllowed = activation == '1' and outcome == false
    elseif eventName == 'short_return' then
      lifecycleAllowed =
        outcome == 'destination_ready' and shortReturn == false
    else
      lifecycleAllowed = false
    end
  end

  redis.call('HINCRBY', KEYS[1], '${HEALTH_ATTEMPTS_FIELD}', 1)

  if duplicate or not lifecycleAllowed then
    redis.call('HINCRBY', KEYS[1], '${HEALTH_DUPLICATES_FIELD}', 1)
    results[#results + 1] = 0
  else
    redis.call('SET', dedupeKey, '1', 'EX', ARGV[1])
    if contributionCapped then
      if eventName == 'impression' then
        redis.call('HSET', lifecycleKey, 'impression', '1')
        redis.call('PFADD', segmentContributorsKey, windowContributor)
        redis.call('PFADD', itemContributorsKey, windowContributor)
        redis.call('EXPIRE', segmentContributorsKey, ARGV[2])
        redis.call('EXPIRE', itemContributorsKey, ARGV[2])
      elseif eventName == 'activation' then
        redis.call('HSET', lifecycleKey, 'activation', '1')
      elseif eventName == 'destination_ready' or eventName == 'drop_off' then
        redis.call('HSET', lifecycleKey, 'outcome', eventName)
      elseif eventName == 'short_return' then
        redis.call('HSET', lifecycleKey, 'short_return', '1')
      end
      redis.call('EXPIRE', lifecycleKey, ARGV[3])
    end
    redis.call('HINCRBY', KEYS[1], aggregateField, 1)
    redis.call('HINCRBY', KEYS[1], '${HEALTH_ACCEPTED_FIELD}', 1)
    if unknownItem == '1' then
      redis.call('HINCRBY', KEYS[1], '${HEALTH_UNKNOWN_ITEMS_FIELD}', 1)
    end
    results[#results + 1] = 1
  end

  eventIndex = eventIndex + 1
end

redis.call('EXPIRE', KEYS[1], ARGV[2])
return results
`;

export class NavigationTelemetryStoreUnavailableError extends Error {
  constructor() {
    super('Navigation telemetry aggregate store is unavailable');
    this.name = 'NavigationTelemetryStoreUnavailableError';
  }
}

export class NavigationTelemetryPrivacyUnavailableError extends Error {
  constructor() {
    super('Navigation telemetry privacy key is unavailable');
    this.name = 'NavigationTelemetryPrivacyUnavailableError';
  }
}

export interface NavigationTelemetryRecordResult {
  readonly status: 'accepted' | 'duplicate';
}

export interface NavigationTelemetryBatchRecordResult {
  readonly results: readonly NavigationTelemetryRecordResult[];
}

interface AggregateRecord {
  readonly payload: Omit<NavigationTelemetryPayload, 'event_id'>;
  readonly count: number;
}

interface MutableItemBaseline {
  impressions: number;
  activations: number;
  destinationReady: number;
}

export interface SuppressedItemBaseline {
  readonly suppressed: true;
  readonly minimumSample: number;
}

export interface PublishedItemBaseline {
  readonly suppressed: false;
  readonly impressions: number;
  readonly activations: number;
  readonly destinationReady: number;
  readonly activationRate: number;
  readonly destinationReadyRate: number;
}

export interface SuppressedNavigationSegment {
  readonly navVariant: NavigationVariant;
  readonly platform: NavigationPlatform;
  readonly suppressed: true;
  readonly minimumSample: number;
}

export interface PublishedNavigationSegment {
  readonly navVariant: NavigationVariant;
  readonly platform: NavigationPlatform;
  readonly suppressed: false;
  readonly denominator: number;
  readonly activationCount: number;
  readonly destinationReadyCount: number;
  readonly dropOffCount: number;
  readonly shortReturnCount: number;
  readonly consentCoverageRate: number;
  readonly destinationReadyCoverageRate: number;
  readonly shortReturnRate: number;
  readonly activationToReadyP50Bucket: NavigationLatencyBucket | null;
  readonly activationToReadyP95Bucket: NavigationLatencyBucket | null;
  readonly activationToReadyP50UpperBoundMs: number | null;
  readonly activationToReadyP95UpperBoundMs: number | null;
  readonly items: Readonly<
    Record<NavigationItemId, SuppressedItemBaseline | PublishedItemBaseline>
  >;
}

export type NavigationBaselineSegment =
  | SuppressedNavigationSegment
  | PublishedNavigationSegment;

export interface NavigationTelemetryHealth {
  readonly deliveryRate: number;
  readonly dedupeRate: number;
  readonly unknownItemRate: number;
}

export interface NavigationTelemetryBaseline {
  readonly schemaVersion: typeof NAVIGATION_TELEMETRY_SCHEMA_VERSION;
  readonly owner: typeof NAVIGATION_TELEMETRY_OWNER;
  readonly rangeDays: typeof NAVIGATION_TELEMETRY_BASELINE_DAYS;
  readonly minimumSample: typeof NAVIGATION_TELEMETRY_MINIMUM_SAMPLE;
  readonly retentionDays: typeof NAVIGATION_TELEMETRY_RETENTION_DAYS;
  readonly startDate: string;
  readonly endDate: string;
  readonly published: boolean;
  readonly health: NavigationTelemetryHealth | null;
  readonly segments: readonly NavigationBaselineSegment[];
}

interface DailyHealth {
  attempts: number;
  accepted: number;
  duplicates: number;
  unknownItems: number;
}

interface MutableSegment {
  readonly navVariant: NavigationVariant;
  readonly platform: NavigationPlatform;
  denominator: number;
  activations: number;
  destinationReady: number;
  dropOffs: number;
  shortReturns: number;
  explicitImpressions: number;
  readonly latency: Map<NavigationLatencyBucket, number>;
  readonly items: Map<NavigationItemId, MutableItemBaseline>;
}

interface ContributorCounts {
  readonly segments: ReadonlyMap<string, number>;
  readonly items: ReadonlyMap<string, number>;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dailyKey(date: Date): string {
  return `${KEY_PREFIX}:day:${utcDay(date)}`;
}

async function hashEventId(eventId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(eventId)
  );
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

async function keyedContributorDigest(input: string): Promise<string> {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new NavigationTelemetryPrivacyUnavailableError();
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

async function hashDailyContributorId(
  contributorId: string,
  recordedAt: Date
): Promise<string> {
  return keyedContributorDigest(
    `navigation-telemetry:daily:v${NAVIGATION_TELEMETRY_SCHEMA_VERSION}:${utcDay(recordedAt)}:${contributorId}`
  );
}

async function hashWindowContributorId(contributorId: string): Promise<string> {
  return keyedContributorDigest(
    `navigation-telemetry:window:v${NAVIGATION_TELEMETRY_SCHEMA_VERSION}:${contributorId}`
  );
}

function segmentContributorKey(input: {
  readonly date: Date;
  readonly navVariant: NavigationVariant;
  readonly platform: NavigationPlatform;
}): string {
  return `${KEY_PREFIX}:contributors:${utcDay(input.date)}:${input.navVariant}:${input.platform}`;
}

function itemContributorKey(input: {
  readonly date: Date;
  readonly navVariant: NavigationVariant;
  readonly platform: NavigationPlatform;
  readonly itemId: NavigationItemId;
}): string {
  return `${segmentContributorKey(input)}:${input.itemId}`;
}

function segmentCountKey(
  navVariant: NavigationVariant,
  platform: NavigationPlatform
): string {
  return `${navVariant}|${platform}`;
}

function itemCountKey(
  navVariant: NavigationVariant,
  platform: NavigationPlatform,
  itemId: NavigationItemId
): string {
  return `${segmentCountKey(navVariant, platform)}|${itemId}`;
}

function requireNonEmptyKeys(keys: readonly string[]): [string, ...string[]] {
  const [first, ...rest] = keys;
  if (!first) throw new NavigationTelemetryPrivacyUnavailableError();
  return [first, ...rest];
}

function aggregateField(payload: NavigationTelemetryPayload): string {
  return [
    'event',
    payload.event,
    payload.item_id,
    payload.source_route,
    payload.destination_route,
    payload.input_method,
    payload.platform,
    payload.nav_variant,
    payload.consent_mode,
    payload.latency_bucket,
    payload.success ? '1' : '0',
  ].join('|');
}

function lifecycleField(payload: NavigationTelemetryPayload): string {
  return [payload.nav_variant, payload.platform, payload.item_id].join('|');
}

function assertPipelineSucceeded(results: unknown[]): void {
  const error = results.find(result => result instanceof Error);
  if (error instanceof Error) throw error;
}

/**
 * Aggregate-first write. No raw event row exists. Expiring Redis state is
 * limited to SHA-256 event-id dedupe keys, keyed lifecycle hashes, and keyed
 * contributor HyperLogLogs used for distinct-contributor suppression.
 */
export async function recordNavigationTelemetry(
  payload: NavigationTelemetryPayload,
  contributorId: string,
  recordedAt = new Date()
): Promise<NavigationTelemetryRecordResult> {
  const result = await recordNavigationTelemetryBatch([payload], {
    contributorId,
    recordedAt,
  });
  const first = result.results[0];
  if (!first)
    throw new Error('Unexpected navigation telemetry aggregate result');
  return first;
}

/**
 * Records a bounded request in one Redis script. Daily keyed lifecycle state
 * enforces impression -> activation -> one terminal outcome -> short return,
 * while non-enumerable daily HyperLogLogs retain only a keyed contributor
 * digest for 30-day distinct-contributor suppression.
 */
export async function recordNavigationTelemetryBatch(
  payloads: readonly NavigationTelemetryPayload[],
  options: {
    readonly recordedAt?: Date;
    readonly contributorId: string;
  }
): Promise<NavigationTelemetryBatchRecordResult> {
  const redis = getRedis();
  if (!redis) throw new NavigationTelemetryStoreUnavailableError();

  if (payloads.length === 0) return { results: [] };
  if (payloads.length > NAVIGATION_TELEMETRY_MAX_BATCH_SIZE) {
    throw new Error('Navigation telemetry batch exceeds the bounded maximum');
  }

  const recordedAt = options.recordedAt ?? new Date();
  const key = dailyKey(recordedAt);
  const [dailyContributorHash, windowContributorHash] = await Promise.all([
    hashDailyContributorId(options.contributorId, recordedAt),
    hashWindowContributorId(options.contributorId),
  ]);
  const eventHashes = await Promise.all(
    payloads.map(payload => hashEventId(payload.event_id))
  );
  const keys = [key];
  const args = [
    String(NAVIGATION_TELEMETRY_DEDUP_TTL_SECONDS),
    String(RETENTION_SECONDS),
    String(RETENTION_SECONDS),
  ];

  payloads.forEach((payload, index) => {
    const dedupeKey = `${KEY_PREFIX}:dedupe:${eventHashes[index]}`;
    const lifecycleKey = `${KEY_PREFIX}:lifecycle:${utcDay(recordedAt)}:${dailyContributorHash}:${lifecycleField(payload)}`;
    const segmentHllKey = segmentContributorKey({
      date: recordedAt,
      navVariant: payload.nav_variant,
      platform: payload.platform,
    });
    const itemHllKey = itemContributorKey({
      date: recordedAt,
      navVariant: payload.nav_variant,
      platform: payload.platform,
      itemId: payload.item_id,
    });
    keys.push(dedupeKey, lifecycleKey, segmentHllKey, itemHllKey);
    args.push(
      aggregateField(payload),
      payload.item_id === 'unknown' ? '1' : '0',
      payload.event,
      '1',
      windowContributorHash
    );
  });

  const result = await redis
    .createScript<readonly number[]>(RECORD_NAVIGATION_TELEMETRY_BATCH_SCRIPT)
    .eval(keys, args);

  if (
    !Array.isArray(result) ||
    result.length !== payloads.length ||
    result.some(value => value !== 0 && value !== 1)
  ) {
    throw new Error('Unexpected navigation telemetry aggregate result');
  }
  return {
    results: result.map(value => ({
      status: value === 1 ? 'accepted' : 'duplicate',
    })),
  };
}

function parseCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseAggregateField(
  field: string,
  value: unknown
): AggregateRecord | null {
  const parts = field.split('|');
  if (parts.length !== 11 || parts[0] !== 'event') return null;

  const [
    ,
    event,
    itemId,
    sourceRoute,
    destinationRoute,
    inputMethod,
    platform,
    navVariant,
    consentMode,
    latencyBucket,
    success,
  ] = parts;
  const count = parseCount(value);
  if (!count) return null;

  const candidate = {
    schema_version: NAVIGATION_TELEMETRY_SCHEMA_VERSION,
    event_id: `aggregate-field-parser:${event}`,
    event,
    item_id: itemId,
    source_route: sourceRoute,
    destination_route: destinationRoute,
    input_method: inputMethod,
    platform,
    nav_variant: navVariant,
    consent_mode: consentMode,
    latency_bucket: latencyBucket,
    success: success === '1',
  };

  // Use the canonical strict schema as the parser so stale/corrupt fields do
  // not escape the same allowlist enforced at ingest.
  const parsed = navigationTelemetryPayloadSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const { event_id: _eventId, ...payload } = parsed.data;
  return { payload, count };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0
    ? Math.min(1, Math.max(0, numerator / denominator))
    : 0;
}

function quantileBucket(
  histogram: Map<NavigationLatencyBucket, number>,
  quantile: number
): NavigationLatencyBucket | null {
  const total = [...histogram.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) return null;
  const target = Math.ceil(total * quantile);
  let cumulative = 0;
  for (const bucket of NAVIGATION_LATENCY_BUCKETS) {
    if (bucket === 'na') continue;
    cumulative += histogram.get(bucket) ?? 0;
    if (cumulative >= target) return bucket;
  }
  return null;
}

function getOrCreateSegment(
  segments: Map<string, MutableSegment>,
  record: AggregateRecord
): MutableSegment {
  const key = `${record.payload.nav_variant}|${record.payload.platform}`;
  const existing = segments.get(key);
  if (existing) return existing;

  const created: MutableSegment = {
    navVariant: record.payload.nav_variant,
    platform: record.payload.platform,
    denominator: 0,
    activations: 0,
    destinationReady: 0,
    dropOffs: 0,
    shortReturns: 0,
    explicitImpressions: 0,
    latency: new Map(),
    items: new Map(),
  };
  segments.set(key, created);
  return created;
}

function applyRecord(segment: MutableSegment, record: AggregateRecord): void {
  const item = segment.items.get(record.payload.item_id) ?? {
    impressions: 0,
    activations: 0,
    destinationReady: 0,
  };
  segment.items.set(record.payload.item_id, item);

  switch (record.payload.event) {
    case 'impression':
      segment.denominator += record.count;
      item.impressions += record.count;
      if (record.payload.consent_mode === 'explicit') {
        segment.explicitImpressions += record.count;
      }
      break;
    case 'activation':
      segment.activations += record.count;
      item.activations += record.count;
      break;
    case 'destination_ready':
      segment.destinationReady += record.count;
      item.destinationReady += record.count;
      segment.latency.set(
        record.payload.latency_bucket,
        (segment.latency.get(record.payload.latency_bucket) ?? 0) + record.count
      );
      break;
    case 'drop_off':
      segment.dropOffs += record.count;
      break;
    case 'short_return':
      segment.shortReturns += record.count;
      break;
  }
}

function publishItems(
  segment: MutableSegment,
  contributorCounts: ContributorCounts
): Record<NavigationItemId, SuppressedItemBaseline | PublishedItemBaseline> {
  return Object.fromEntries(
    NAVIGATION_ITEM_IDS.map(itemId => {
      const item = segment.items.get(itemId) ?? {
        impressions: 0,
        activations: 0,
        destinationReady: 0,
      };
      const distinctContributors =
        contributorCounts.items.get(
          itemCountKey(segment.navVariant, segment.platform, itemId)
        ) ?? 0;
      if (
        distinctContributors <
        NAVIGATION_TELEMETRY_MINIMUM_SAMPLE +
          NAVIGATION_TELEMETRY_CARDINALITY_SAFETY_MARGIN
      ) {
        return [
          itemId,
          {
            suppressed: true,
            minimumSample: NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
          },
        ];
      }
      return [
        itemId,
        {
          suppressed: false,
          impressions: item.impressions,
          activations: item.activations,
          destinationReady: item.destinationReady,
          activationRate: ratio(item.activations, item.impressions),
          destinationReadyRate: ratio(item.destinationReady, item.activations),
        },
      ];
    })
  ) as Record<NavigationItemId, SuppressedItemBaseline | PublishedItemBaseline>;
}

function publishSegment(
  segment: MutableSegment,
  contributorCounts: ContributorCounts
): NavigationBaselineSegment {
  const distinctContributors =
    contributorCounts.segments.get(
      segmentCountKey(segment.navVariant, segment.platform)
    ) ?? 0;
  if (
    distinctContributors <
    NAVIGATION_TELEMETRY_MINIMUM_SAMPLE +
      NAVIGATION_TELEMETRY_CARDINALITY_SAFETY_MARGIN
  ) {
    return {
      navVariant: segment.navVariant,
      platform: segment.platform,
      suppressed: true,
      minimumSample: NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
    };
  }

  const p50 = quantileBucket(segment.latency, 0.5);
  const p95 = quantileBucket(segment.latency, 0.95);
  return {
    navVariant: segment.navVariant,
    platform: segment.platform,
    suppressed: false,
    denominator: segment.denominator,
    activationCount: segment.activations,
    destinationReadyCount: segment.destinationReady,
    dropOffCount: segment.dropOffs,
    shortReturnCount: segment.shortReturns,
    consentCoverageRate: ratio(
      segment.explicitImpressions,
      segment.denominator
    ),
    destinationReadyCoverageRate: ratio(
      segment.destinationReady,
      segment.activations
    ),
    shortReturnRate: ratio(segment.shortReturns, segment.destinationReady),
    activationToReadyP50Bucket: p50,
    activationToReadyP95Bucket: p95,
    activationToReadyP50UpperBoundMs: p50
      ? navigationLatencyBucketUpperBoundMs(p50)
      : null,
    activationToReadyP95UpperBoundMs: p95
      ? navigationLatencyBucketUpperBoundMs(p95)
      : null,
    items: publishItems(segment, contributorCounts),
  };
}

function readDailyHashes(input: {
  readonly hashes: readonly (Readonly<Record<string, unknown>> | null)[];
  readonly contributorCounts: ContributorCounts;
  readonly startDate: string;
  readonly endDate: string;
}): NavigationTelemetryBaseline {
  const segments = new Map<string, MutableSegment>();
  const health: DailyHealth = {
    attempts: 0,
    accepted: 0,
    duplicates: 0,
    unknownItems: 0,
  };

  for (const hash of input.hashes) {
    if (!hash) continue;
    health.attempts += parseCount(hash[HEALTH_ATTEMPTS_FIELD]);
    health.accepted += parseCount(hash[HEALTH_ACCEPTED_FIELD]);
    health.duplicates += parseCount(hash[HEALTH_DUPLICATES_FIELD]);
    health.unknownItems += parseCount(hash[HEALTH_UNKNOWN_ITEMS_FIELD]);

    for (const [field, value] of Object.entries(hash)) {
      const record = parseAggregateField(field, value);
      if (!record) continue;
      applyRecord(getOrCreateSegment(segments, record), record);
    }
  }

  const publishedSegments = [...segments.values()]
    .sort((left, right) =>
      `${left.navVariant}|${left.platform}`.localeCompare(
        `${right.navVariant}|${right.platform}`
      )
    )
    .map(segment => publishSegment(segment, input.contributorCounts));
  const published = publishedSegments.some(segment => !segment.suppressed);

  return {
    schemaVersion: NAVIGATION_TELEMETRY_SCHEMA_VERSION,
    owner: NAVIGATION_TELEMETRY_OWNER,
    rangeDays: NAVIGATION_TELEMETRY_BASELINE_DAYS,
    minimumSample: NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
    retentionDays: NAVIGATION_TELEMETRY_RETENTION_DAYS,
    startDate: input.startDate,
    endDate: input.endDate,
    published,
    health: published
      ? {
          deliveryRate: ratio(health.accepted, health.attempts),
          dedupeRate: ratio(health.duplicates, health.attempts),
          unknownItemRate: ratio(health.unknownItems, health.accepted),
        }
      : null,
    segments: publishedSegments,
  };
}

function parseContributorEstimate(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new NavigationTelemetryPrivacyUnavailableError();
  }
  return parsed;
}

function readContributorCounts(results: readonly unknown[]): ContributorCounts {
  const segments = new Map<string, number>();
  const items = new Map<string, number>();
  let index = 0;

  for (const navVariant of NAVIGATION_VARIANTS) {
    for (const platform of NAVIGATION_PLATFORMS) {
      segments.set(
        segmentCountKey(navVariant, platform),
        parseContributorEstimate(results[index])
      );
      index += 1;
      for (const itemId of NAVIGATION_ITEM_IDS) {
        items.set(
          itemCountKey(navVariant, platform, itemId),
          parseContributorEstimate(results[index])
        );
        index += 1;
      }
    }
  }

  if (index !== results.length) {
    throw new NavigationTelemetryPrivacyUnavailableError();
  }
  return { items, segments };
}

export async function getNavigationTelemetryBaseline(
  end = new Date()
): Promise<NavigationTelemetryBaseline> {
  const redis = getRedis();
  if (!redis) throw new NavigationTelemetryStoreUnavailableError();

  const dates = Array.from(
    { length: NAVIGATION_TELEMETRY_BASELINE_DAYS },
    (_, index) => {
      const date = new Date(end);
      date.setUTCDate(
        date.getUTCDate() - (NAVIGATION_TELEMETRY_BASELINE_DAYS - 1 - index)
      );
      return date;
    }
  );
  const pipeline = redis.pipeline();
  for (const date of dates) pipeline.hgetall(dailyKey(date));
  const results = await pipeline.exec();
  assertPipelineSucceeded(results);

  const cardinalityPipeline = redis.pipeline();
  for (const navVariant of NAVIGATION_VARIANTS) {
    for (const platform of NAVIGATION_PLATFORMS) {
      cardinalityPipeline.pfcount(
        ...requireNonEmptyKeys(
          dates.map(date =>
            segmentContributorKey({ date, navVariant, platform })
          )
        )
      );
      for (const itemId of NAVIGATION_ITEM_IDS) {
        cardinalityPipeline.pfcount(
          ...requireNonEmptyKeys(
            dates.map(date =>
              itemContributorKey({ date, itemId, navVariant, platform })
            )
          )
        );
      }
    }
  }
  const cardinalityResults = await cardinalityPipeline.exec();
  assertPipelineSucceeded(cardinalityResults);

  return readDailyHashes({
    hashes: results.map(result =>
      result && typeof result === 'object' && !(result instanceof Error)
        ? (result as Readonly<Record<string, unknown>>)
        : null
    ),
    contributorCounts: readContributorCounts(cardinalityResults),
    startDate: utcDay(dates[0] ?? end),
    endDate: utcDay(dates.at(-1) ?? end),
  });
}

export const navigationTelemetryTestUtils = {
  aggregateField,
  dailyKey,
  readDailyHashes,
};
