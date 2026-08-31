import { computeRatePercent } from '@/lib/analytics/metrics';
import { canonicalizeSurfaceUrl } from '@/lib/profile-surfaces/contracts';
import {
  CITATION_ENGINES,
  classifyCitationTrend,
  type CitationEngine,
} from './citation-monitor';

// Collectors own provider I/O, consent hydration, excerpt bounds, and persistence.
export const ASSET_VISIBILITY_QUERY_SET_VERSION =
  'presence-asset-visibility:v1' as const;

export type CreatorAssetKind =
  | 'artist'
  | 'music'
  | 'video'
  | 'merch'
  | 'ticket'
  | 'creator_product';
export type AssetPublicationState = 'public' | 'private' | 'unpublished';
export interface CreatorAssetDescriptor {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly kind: CreatorAssetKind;
  readonly name: string;
  readonly creatorName: string;
  readonly canonicalUrl: string | null;
  readonly publicationState: AssetPublicationState;
  readonly category?: string | null;
}
export type AssetVisibilityQueryIntent =
  | 'identity'
  | 'recommendation'
  | 'specific_work'
  | 'availability';
export interface AssetVisibilityQuery {
  readonly id: string;
  readonly assetKind: CreatorAssetKind;
  readonly intent: AssetVisibilityQueryIntent;
  readonly text: string;
}
export interface PrivateMonitoringConsent {
  readonly creatorProfileId: string;
  readonly purpose: 'creator_private_monitoring';
}
export interface AssetVisibilityQuerySet {
  readonly version: typeof ASSET_VISIBILITY_QUERY_SET_VERSION;
  readonly eligible: boolean;
  readonly consentScope: 'public' | 'creator_private_monitoring' | null;
  readonly reason: 'explicit_creator_consent_required' | null;
  readonly queries: readonly AssetVisibilityQuery[];
}
export type AssetRecommendationContext =
  | 'recommended'
  | 'listed'
  | 'mentioned'
  | 'citation_only'
  | 'absent';
export type AssetVisibilitySourceKind =
  | 'citation'
  | 'platform'
  | 'retailer'
  | 'creator_site';
export interface AssetVisibilitySource {
  readonly kind: AssetVisibilitySourceKind;
  readonly url: string;
  readonly platform: string;
  readonly title: string | null;
}
export interface AssetVisibilityCompetitor {
  readonly name: string;
  readonly recommendationPosition: number | null;
  readonly context: Exclude<AssetRecommendationContext, 'absent'>;
  readonly sourceUrl: string | null;
  readonly platform: string | null;
}
export interface AssetVisibilityProvenance {
  readonly runId: string;
  readonly engine: CitationEngine;
  readonly model: string;
  readonly modelVersion: string | null;
  readonly promptVersion: string;
  readonly querySetVersion: string;
  readonly market: string;
  readonly locale: string;
  readonly observedAt: string;
}
export interface AssetVisibilityObservation {
  readonly id: string;
  readonly assetId: string;
  readonly queryId: string;
  readonly query: string;
  readonly appeared: boolean;
  readonly recommendationPosition: number | null;
  readonly context: AssetRecommendationContext;
  readonly evidenceExcerpt: string | null;
  readonly sources: readonly AssetVisibilitySource[];
  readonly competitors: readonly AssetVisibilityCompetitor[];
  readonly provenance: AssetVisibilityProvenance;
}
export interface AssetVisibilitySummary {
  readonly observedQueries: number;
  readonly appearedQueries: number;
  readonly appearanceRate: number;
  readonly bestPosition: number | null;
  readonly averagePosition: number | null;
  readonly contexts: Readonly<Record<AssetRecommendationContext, number>>;
}
export interface AssetCompetitorSummary {
  readonly name: string;
  readonly appearanceCount: number;
  readonly aheadCount: number;
  readonly bestPosition: number | null;
  readonly averagePosition: number | null;
  readonly platforms: readonly string[];
  readonly sourceUrls: readonly string[];
  readonly sourceObservationIds: readonly string[];
  readonly aheadObservationIds: readonly string[];
}
export interface AssetVisibilityTrend {
  readonly comparable: boolean;
  readonly status: 'baseline' | 'up' | 'down' | 'steady' | 'incomparable';
  readonly reason:
    | 'no_previous_observations'
    | 'query_set_mismatch'
    | 'provenance_mismatch'
    | null;
  readonly appearanceRateDelta: number | null;
  readonly averagePositionChange: number | null;
}
export type AssetVisibilityActionCode =
  | 'collect_baseline'
  | 'improve_asset_discoverability'
  | 'close_competitor_gap'
  | 'add_canonical_citation'
  | 'investigate_visibility_decline';
export interface AssetVisibilityAction {
  readonly code: AssetVisibilityActionCode;
  readonly priority: 'high' | 'medium' | 'low';
  readonly reason: string;
  readonly sourceObservationIds: readonly string[];
  readonly approvalBoundary: 'prepare_only';
}
export interface AssetVisibilityReport {
  readonly asset: CreatorAssetDescriptor;
  readonly observations: readonly AssetVisibilityObservation[];
  readonly visibility: AssetVisibilitySummary;
  readonly sources: readonly AssetVisibilitySource[];
  readonly competitors: readonly AssetCompetitorSummary[];
  readonly trend: AssetVisibilityTrend;
  readonly actions: readonly AssetVisibilityAction[];
}

const category = (asset: CreatorAssetDescriptor, fallback: string) =>
  asset.category?.trim() || fallback;
type QuerySpec = readonly [intent: AssetVisibilityQueryIntent, text: string];
export const assetVisibilityQueryIntentSegment = (intent: string) =>
  intent.replaceAll('_', '-');

function specsFor(asset: CreatorAssetDescriptor): QuerySpec[] {
  const { creatorName: creator, name } = asset;
  switch (asset.kind) {
    case 'artist':
      return [
        ['identity', `Who is ${creator}?`],
        [
          'recommendation',
          `Recommend a ${category(asset, 'creator')} artist or creator to follow.`,
        ],
      ];
    case 'music':
      return [
        ['specific_work', `What is ${name} by ${creator}?`],
        [
          'recommendation',
          `Recommend a ${category(asset, 'song or release')} song or release to listen to.`,
        ],
      ];
    case 'video':
      return [
        [
          'recommendation',
          `Recommend a ${category(asset, 'vlogger')} to follow.`,
        ],
        ['specific_work', `What is ${name} by ${creator} about?`],
      ];
    case 'merch':
      return [
        ['availability', `Where can I buy ${name} by ${creator}?`],
        ['recommendation', `Recommend official merch from ${creator}.`],
      ];
    case 'ticket':
      return [
        ['availability', `Where can I buy tickets for ${name} by ${creator}?`],
        ['recommendation', `Which upcoming ${creator} event should I attend?`],
      ];
    case 'creator_product':
      return [
        ['availability', `Where can I buy ${name} from ${creator}?`],
        [
          'recommendation',
          `Recommend a ${category(asset, 'creator product')} from ${creator}.`,
        ],
      ];
  }
}

const queriesFor = (asset: CreatorAssetDescriptor): AssetVisibilityQuery[] =>
  specsFor(asset).map(([intent, text]) => ({
    id: `${asset.kind}:${assetVisibilityQueryIntentSegment(intent)}`,
    assetKind: asset.kind,
    intent,
    text,
  }));

export function buildAssetVisibilityQuerySet(
  asset: CreatorAssetDescriptor,
  options: { readonly privateMonitoringConsent?: PrivateMonitoringConsent } = {}
): AssetVisibilityQuerySet {
  const isPublic = asset.publicationState === 'public';
  const consent = options.privateMonitoringConsent;
  const allowed =
    isPublic ||
    (consent?.purpose === 'creator_private_monitoring' &&
      consent.creatorProfileId === asset.creatorProfileId);
  return allowed
    ? {
        version: ASSET_VISIBILITY_QUERY_SET_VERSION,
        eligible: true,
        consentScope: isPublic ? 'public' : 'creator_private_monitoring',
        reason: null,
        queries: queriesFor(asset),
      }
    : {
        version: ASSET_VISIBILITY_QUERY_SET_VERSION,
        eligible: false,
        consentScope: null,
        reason: 'explicit_creator_consent_required',
        queries: [],
      };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const average = (values: readonly number[]) =>
  values.length
    ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
const validPosition = (position: number | null): position is number =>
  position !== null && Number.isInteger(position) && position >= 1;
const normalizeUrl = (url: string) =>
  canonicalizeSurfaceUrl(url)?.url ?? url.trim();
const alphabetical = (left: string, right: string) => left.localeCompare(right);

function summarizeVisibility(
  observations: readonly AssetVisibilityObservation[]
): AssetVisibilitySummary {
  const appearedQueries = observations.filter(item => item.appeared).length;
  const positions = observations
    .map(item => item.recommendationPosition)
    .filter(validPosition);
  const contexts: Record<AssetRecommendationContext, number> = {
    recommended: 0,
    listed: 0,
    mentioned: 0,
    citation_only: 0,
    absent: 0,
  };
  for (const item of observations) contexts[item.context] += 1;
  return {
    observedQueries: observations.length,
    appearedQueries,
    appearanceRate:
      computeRatePercent(appearedQueries, observations.length, 1) / 100,
    bestPosition: positions.length ? Math.min(...positions) : null,
    averagePosition: average(positions),
    contexts,
  };
}

function collectSources(observations: readonly AssetVisibilityObservation[]) {
  const unique = new Map<string, AssetVisibilitySource>();
  for (const item of observations) {
    for (const source of item.sources) {
      const key = `${source.kind}:${source.platform.toLowerCase()}:${normalizeUrl(source.url)}`;
      if (!unique.has(key)) unique.set(key, source);
    }
  }
  return [...unique.values()];
}

type CompetitorGroup = {
  name: string;
  appearanceCount: number;
  aheadCount: number;
  positions: number[];
  platforms: Set<string>;
  sourceUrls: Set<string>;
  sourceObservationIds: Set<string>;
  aheadObservationIds: Set<string>;
};
function summarizeCompetitors(
  observations: readonly AssetVisibilityObservation[]
) {
  const groups = new Map<string, CompetitorGroup>();
  for (const item of observations) {
    for (const competitor of item.competitors) {
      const key = competitor.name.trim().toLowerCase();
      const group = groups.get(key) ?? {
        name: competitor.name.trim(),
        appearanceCount: 0,
        aheadCount: 0,
        positions: [],
        platforms: new Set<string>(),
        sourceUrls: new Set<string>(),
        sourceObservationIds: new Set<string>(),
        aheadObservationIds: new Set<string>(),
      };
      group.appearanceCount += 1;
      group.sourceObservationIds.add(item.id);
      group.platforms.add(competitor.platform ?? '');
      group.sourceUrls.add(competitor.sourceUrl ?? '');
      if (validPosition(competitor.recommendationPosition)) {
        group.positions.push(competitor.recommendationPosition);
        if (
          !validPosition(item.recommendationPosition) ||
          competitor.recommendationPosition < item.recommendationPosition
        ) {
          group.aheadCount += 1;
          group.aheadObservationIds.add(item.id);
        }
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map(group => ({
      name: group.name,
      appearanceCount: group.appearanceCount,
      aheadCount: group.aheadCount,
      bestPosition: group.positions.length
        ? Math.min(...group.positions)
        : null,
      averagePosition: average(group.positions),
      platforms: [...group.platforms].filter(Boolean).sort(alphabetical),
      sourceUrls: [...group.sourceUrls].filter(Boolean).sort(alphabetical),
      sourceObservationIds: [...group.sourceObservationIds].sort(alphabetical),
      aheadObservationIds: [...group.aheadObservationIds].sort(alphabetical),
    }))
    .sort(
      (left, right) =>
        right.aheadCount - left.aheadCount ||
        right.appearanceCount - left.appearanceCount ||
        left.name.localeCompare(right.name)
    );
}

const identity = ({ queryId, query, provenance }: AssetVisibilityObservation) =>
  JSON.stringify([
    queryId,
    query,
    provenance.engine,
    provenance.model,
    provenance.modelVersion,
    provenance.promptVersion,
    provenance.querySetVersion,
    provenance.market,
    provenance.locale,
  ]);
function assertValidObservations(
  observations: readonly AssetVisibilityObservation[]
) {
  for (const item of observations) {
    if (
      item.recommendationPosition !== null &&
      !validPosition(item.recommendationPosition)
    )
      throw new Error('asset_visibility_observation_invalid_position');
    if (
      (!item.appeared && item.context !== 'absent') ||
      (!item.appeared && item.recommendationPosition !== null) ||
      (item.appeared && item.context === 'absent')
    )
      throw new Error('asset_visibility_observation_field_mismatch');
    if (
      item.competitors.some(
        competitor =>
          competitor.recommendationPosition !== null &&
          !validPosition(competitor.recommendationPosition)
      )
    )
      throw new Error('asset_visibility_competitor_invalid_position');
  }
}
function assertUniqueObservationIds(
  observations: readonly AssetVisibilityObservation[]
) {
  const seen = new Set<string>();
  for (const item of observations) {
    const id = item.id.trim();
    if (id.length === 0 || id !== item.id)
      throw new Error('asset_visibility_observation_invalid_id');
    if (seen.has(id))
      throw new Error('asset_visibility_observation_duplicate_id');
    seen.add(id);
  }
}
function assertUniqueObservationIdentities(
  observations: readonly AssetVisibilityObservation[]
) {
  const seen = new Set<string>();
  for (const item of observations) {
    const key = identity(item);
    if (seen.has(key))
      throw new Error('asset_visibility_observation_duplicate_identity');
    seen.add(key);
  }
}
const trend = (
  comparable: boolean,
  status: AssetVisibilityTrend['status'],
  reason: AssetVisibilityTrend['reason'],
  appearanceRateDelta: number | null = null,
  averagePositionChange: number | null = null
): AssetVisibilityTrend => ({
  comparable,
  status,
  reason,
  appearanceRateDelta,
  averagePositionChange,
});
function compareRankedPositionMovement(
  current: readonly AssetVisibilityObservation[],
  previous: readonly AssetVisibilityObservation[]
) {
  const previousPositions = new Map(
    previous.map(item => [identity(item), item.recommendationPosition])
  );
  const movements: number[] = [];
  for (const item of current) {
    const currentPosition = item.recommendationPosition;
    const previousPosition = previousPositions.get(identity(item)) ?? null;
    if (validPosition(currentPosition) && validPosition(previousPosition))
      movements.push(previousPosition - currentPosition);
  }
  return average(movements);
}

type DirectionalTrendStatus = Exclude<
  AssetVisibilityTrend['status'],
  'incomparable'
>;

function directionalStatus(
  delta: number,
  threshold: number
): DirectionalTrendStatus {
  if (delta > threshold) return 'up';
  if (delta < -threshold) return 'down';
  return 'steady';
}

function combineTrendStatus(
  rateStatus: DirectionalTrendStatus,
  rankStatus: DirectionalTrendStatus
): DirectionalTrendStatus {
  if (rateStatus === 'down' || rankStatus === 'down') return 'down';
  if (rateStatus === 'up' || rankStatus === 'up') return 'up';
  return 'steady';
}

const combineRankMovement = (
  averagePositionDelta: number | null,
  rankCoverageDelta: number
) => {
  if (rankCoverageDelta === 0) return averagePositionDelta;
  if (averagePositionDelta === null || averagePositionDelta === 0)
    return rankCoverageDelta;
  if (Math.sign(averagePositionDelta) === Math.sign(rankCoverageDelta))
    return Math.abs(averagePositionDelta) >= Math.abs(rankCoverageDelta)
      ? averagePositionDelta
      : rankCoverageDelta;
  return Math.min(averagePositionDelta, rankCoverageDelta);
};
function compareRankCoverage(
  current: readonly AssetVisibilityObservation[],
  previous: readonly AssetVisibilityObservation[]
) {
  const previousPositions = new Map(
    previous.map(item => [identity(item), item.recommendationPosition])
  );
  return current.reduce((sum, item) => {
    const currentRanked = validPosition(item.recommendationPosition);
    const previousRanked = validPosition(
      previousPositions.get(identity(item)) ?? null
    );
    if (currentRanked === previousRanked) return sum;
    return sum + (currentRanked ? 1 : -1);
  }, 0);
}

function compareRuns(
  current: readonly AssetVisibilityObservation[],
  previous: readonly AssetVisibilityObservation[],
  currentSummary: AssetVisibilitySummary
) {
  if (!previous.length)
    return trend(false, 'baseline', 'no_previous_observations');
  const same = (values: readonly string[], old: readonly string[]) =>
    values.length === old.length &&
    values.every((value, index) => value === old[index]);
  if (
    !same(
      current.map(item => item.queryId).sort(alphabetical),
      previous.map(item => item.queryId).sort(alphabetical)
    )
  )
    return trend(false, 'incomparable', 'query_set_mismatch');
  if (
    !same(
      current.map(identity).sort(alphabetical),
      previous.map(identity).sort(alphabetical)
    )
  )
    return trend(false, 'incomparable', 'provenance_mismatch');
  const old = summarizeVisibility(previous);
  const rateDelta = round(currentSummary.appearanceRate - old.appearanceRate);
  const positionDelta = combineRankMovement(
    compareRankedPositionMovement(current, previous),
    compareRankCoverage(current, previous)
  );
  const rateStatus = directionalStatus(rateDelta, 0.05);
  const rankStatus = directionalStatus(positionDelta ?? 0, 0.5);
  const status = combineTrendStatus(rateStatus, rankStatus);
  return trend(true, status, null, rateDelta, positionDelta);
}

function buildActions(
  asset: CreatorAssetDescriptor,
  observations: readonly AssetVisibilityObservation[],
  visibility: AssetVisibilitySummary,
  sources: readonly AssetVisibilitySource[],
  competitors: readonly AssetCompetitorSummary[],
  assetTrend: AssetVisibilityTrend,
  previousObservations: readonly AssetVisibilityObservation[]
) {
  const ids = observations.map(item => item.id).sort(alphabetical);
  const actions: AssetVisibilityAction[] = [];
  const add = (
    code: AssetVisibilityActionCode,
    priority: AssetVisibilityAction['priority'],
    reason: string,
    sourceObservationIds: readonly string[]
  ) =>
    actions.push({
      code,
      priority,
      reason,
      sourceObservationIds,
      approvalBoundary: 'prepare_only',
    });
  if (!observations.length)
    add(
      'collect_baseline',
      'high',
      `No answer-engine observations exist for ${asset.name}.`,
      []
    );
  else if (!visibility.appearanceRate)
    add(
      'improve_asset_discoverability',
      'high',
      `${asset.name} did not appear in any monitored query.`,
      ids
    );
  const ahead = competitors.filter(item => item.aheadCount > 0);
  if (ahead.length)
    add(
      'close_competitor_gap',
      'high',
      `${ahead.map(item => item.name).join(', ')} ranked ahead of ${asset.name}.`,
      [...new Set(ahead.flatMap(item => item.aheadObservationIds))].sort(
        alphabetical
      )
    );
  const canonical = asset.canonicalUrl
    ? normalizeUrl(asset.canonicalUrl)
    : null;
  if (
    visibility.appearedQueries &&
    canonical &&
    !sources.some(source => normalizeUrl(source.url) === canonical)
  )
    add(
      'add_canonical_citation',
      'medium',
      `${asset.name} appeared without its canonical asset URL being cited.`,
      observations
        .filter(item => item.appeared)
        .map(item => item.id)
        .sort(alphabetical)
    );
  if (assetTrend.status === 'down')
    add(
      'investigate_visibility_decline',
      'high',
      `${asset.name} declined across comparable monitoring runs.`,
      [...new Set([...ids, ...previousObservations.map(item => item.id)])].sort(
        alphabetical
      )
    );
  const order = { high: 0, medium: 1, low: 2 } as const;
  return actions.sort(
    (left, right) => order[left.priority] - order[right.priority]
  );
}

function snapshotRunId(observations: readonly AssetVisibilityObservation[]) {
  const runIds = new Set(
    observations.map(item => item.provenance.runId.trim())
  );
  if ([...runIds].some(runId => runId.length === 0))
    throw new Error('asset_visibility_observation_run_mismatch');
  if (runIds.size > 1)
    throw new Error('asset_visibility_observation_run_mismatch');
  return [...runIds][0] ?? null;
}

export function buildAssetVisibilityReport(input: {
  readonly asset: CreatorAssetDescriptor;
  readonly current: readonly AssetVisibilityObservation[];
  readonly previous?: readonly AssetVisibilityObservation[];
}): AssetVisibilityReport {
  const previous = input.previous ?? [];
  assertValidObservations(input.current);
  assertValidObservations(previous);
  const currentRunId = snapshotRunId(input.current);
  const previousRunId = snapshotRunId(previous);
  if (
    [...input.current, ...previous].some(
      item => item.assetId !== input.asset.id
    )
  )
    throw new Error('asset_visibility_observation_asset_mismatch');
  if (
    input.previous !== undefined &&
    currentRunId &&
    previousRunId &&
    currentRunId === previousRunId
  )
    throw new Error('asset_visibility_observation_comparison_run_mismatch');
  assertUniqueObservationIds([...input.current, ...previous]);
  assertUniqueObservationIdentities(input.current);
  assertUniqueObservationIdentities(previous);
  const visibility = summarizeVisibility(input.current);
  const sources = collectSources(input.current);
  const competitors = summarizeCompetitors(input.current);
  const assetTrend =
    input.previous === undefined
      ? trend(false, 'baseline', 'no_previous_observations')
      : compareRuns(input.current, previous, visibility);
  return {
    asset: input.asset,
    observations: [...input.current],
    visibility,
    sources,
    competitors,
    trend: assetTrend,
    actions: buildActions(
      input.asset,
      input.current,
      visibility,
      sources,
      competitors,
      assetTrend,
      previous
    ),
  };
}

// Observation parse/aggregate contract used by citation monitoring (JOV-5607).
export const AEO_ASSET_VISIBILITY_VARIANT_IDENTITY =
  'aeo-asset-visibility-contract:v1';
export const AEO_ASSET_KINDS = [
  'artist',
  'music',
  'video',
  'merch',
  'ticket',
  'creator_product',
] as const;

export type AeoAssetKind = (typeof AEO_ASSET_KINDS)[number];
export type AeoAssetPublicationState = 'public' | 'unpublished' | 'private';
export type AeoConsentScope = 'public_query' | 'private_observation';
type Nullable<T> = T | null;
type SourceRef = { url: Nullable<string>; platform: Nullable<string> };
type Status<T extends string> = { status: T };
type ConsentMap = Readonly<Record<string, AeoAssetConsent | null>>;

export type AeoRecommendationContext =
  | 'cited_source'
  | 'recommended_item'
  | 'mentioned'
  | 'unknown';
export type AeoAssetRef = {
  assetId: string;
  kind: AeoAssetKind;
  creatorScopeId: string;
  title: string;
  canonicalUrl: Nullable<string>;
  publicationState: AeoAssetPublicationState;
};
export type AeoAssetConsent = {
  creatorScopeId: string;
  assetId: string;
  scope: AeoConsentScope;
  granted: boolean;
};
export type AeoQueryProvenance = {
  querySetId: string;
  querySetVersion: string;
  engine: CitationEngine;
  model: string;
  promptVersion: string;
  market: Nullable<string>;
  locale: Nullable<string>;
  creatorLifecycle: Nullable<string>;
};
export type AeoCompetitor = SourceRef & {
  name: string;
  position: Nullable<number>;
};
export type AeoRecommendationPresence =
  | (Status<'appeared'> & {
      position: Nullable<number>;
      context: AeoRecommendationContext;
    })
  | Status<'absent' | 'unknown'>;
export type AeoCitedSource = (Status<'known'> & SourceRef) | Status<'unknown'>;
export type AeoCompetitorSet =
  | (Status<'known'> & { items: readonly AeoCompetitor[] })
  | Status<'unknown'>;
export type AeoAssetObservation = {
  runId: string;
  observedAt: string;
  asset: AeoAssetRef;
  provenance: AeoQueryProvenance;
  queryText: string;
  presence: AeoRecommendationPresence;
  citedSource: AeoCitedSource;
  competitors: AeoCompetitorSet;
};
export type AeoPrepareOnlyAction = {
  id: string;
  kind: 'prepare_asset_for_recommendation' | 'prepare_competitive_context';
  mode: 'prepare_only';
  priority: number;
  title: string;
  rationale: string;
  sourceEvidence: ReadonlyArray<{ runId: string; field: string }>;
};
export type AeoComparableTrend = {
  comparable: boolean;
  direction: 'up' | 'down' | 'steady' | 'incomparable';
  delta: Nullable<number>;
  reason: string;
  mismatchedFields: readonly string[];
};
type RecordResult =
  | { ok: true; observation: AeoAssetObservation }
  | { ok: false; reason: string; assetId: Nullable<string> };
type ActionReport = {
  assetId: string;
  creatorScopeId: string;
  visibility: { observationCount: number; appearanceCount: number };
  competitorComparison: {
    items: readonly AeoCompetitor[];
    outrankedBy: readonly string[];
  };
};
type AggregateOptions = {
  readonly previous?: readonly unknown[];
  readonly consentByAssetId?: ConsentMap;
  readonly consentByAssetKey?: ConsentMap;
};

const KINDS = new Set<string>(AEO_ASSET_KINDS);
const ENGINES = new Set<string>(CITATION_ENGINES);
const ID_KEYS = new Set(['fanId', 'audienceMemberId', 'email', 'phone']);
const PROV = 'querySetId,querySetVersion,engine,model,promptVersion'.split(
  ','
) as (keyof AeoQueryProvenance)[];
const CTX = new Set(
  'cited_source,recommended_item,mentioned,unknown'.split(',')
);

const rec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v : null;
const timestamp = (v: unknown): string | null => {
  const value = str(v);
  return value && Number.isFinite(Date.parse(value)) ? value : null;
};
const pos = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
const ratio = (n: number, d: number): number =>
  Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : 0;
const rate = (n: number, d: number): number =>
  computeRatePercent(n, d, 1) / 100;
const uniq = (v: readonly (string | null)[]): readonly string[] => [
  ...new Set(v.filter((x): x is string => x != null)),
];
const noId = (v: unknown): boolean =>
  Array.isArray(v)
    ? v.every(noId)
    : !rec(v) ||
      Object.entries(v).every(
        ([key, value]) => !ID_KEYS.has(key) && noId(value)
      );
const rawAssetId = (v: unknown): string | null =>
  rec(v) ? (rec(v.asset) ? str(v.asset.assetId) : str(v.profileUrl)) : null;
const assetKey = (asset: Pick<AeoAssetRef, 'assetId' | 'creatorScopeId'>) =>
  JSON.stringify([asset.creatorScopeId, asset.assetId]);

export function isAeoAssetKind(v: unknown): v is AeoAssetKind {
  return typeof v === 'string' && KINDS.has(v);
}

function isCitationEngine(v: unknown): v is CitationEngine {
  return typeof v === 'string' && ENGINES.has(v);
}

function granted(
  asset: AeoAssetRef,
  consent: AeoAssetConsent | null,
  scopes: readonly AeoConsentScope[]
): boolean {
  return Boolean(
    consent?.granted &&
      scopes.includes(consent.scope) &&
      consent.assetId === asset.assetId &&
      consent.creatorScopeId === asset.creatorScopeId
  );
}

export function aeoProvenanceMismatches(
  a: AeoQueryProvenance,
  b: AeoQueryProvenance
): readonly string[] {
  const out: string[] = [];
  for (const k of PROV) if (a[k] !== b[k]) out.push(k);
  if ((a.market ?? '') !== (b.market ?? '')) out.push('market');
  if ((a.locale ?? '') !== (b.locale ?? '')) out.push('locale');
  return out;
}

export function areAeoRunsComparable(
  a: AeoQueryProvenance,
  b: AeoQueryProvenance
): boolean {
  return aeoProvenanceMismatches(a, b).length === 0;
}

function parsePresence(
  v: Record<string, unknown>
): AeoRecommendationPresence | null {
  if (v.status === 'absent' || v.status === 'unknown')
    return { status: v.status };
  if (v.status !== 'appeared' || !CTX.has(String(v.context))) return null;
  return {
    status: 'appeared',
    position: pos(v.position),
    context: v.context as AeoRecommendationContext,
  };
}

function parseCited(v: Record<string, unknown>): AeoCitedSource | null {
  if (v.status === 'unknown') return { status: 'unknown' };
  if (v.status !== 'known') return null;
  return { status: 'known', url: str(v.url), platform: str(v.platform) };
}

function parseComps(v: Record<string, unknown>): AeoCompetitorSet | null {
  if (v.status === 'unknown') return { status: 'unknown' };
  if (v.status !== 'known' || !Array.isArray(v.items)) return null;
  const items: AeoCompetitor[] = [];
  for (const item of v.items) {
    if (!rec(item) || !str(item.name)) return null;
    items.push({
      name: item.name as string,
      url: str(item.url),
      platform: str(item.platform),
      position: pos(item.position),
    });
  }
  return { status: 'known', items };
}

export function parseAeoAssetObservation(
  v: unknown
): AeoAssetObservation | null {
  if (!rec(v) || !noId(v)) return null;
  const assetV = v.asset;
  const provV = v.provenance;
  const presV = v.presence;
  const citedV = v.citedSource;
  const compV = v.competitors;
  if (!rec(assetV) || !rec(provV)) return null;
  if (!rec(presV) || !rec(citedV) || !rec(compV)) return null;
  const pub = assetV.publicationState;
  const assetId = str(assetV.assetId);
  const scope = str(assetV.creatorScopeId);
  const title = str(assetV.title);
  const qid = str(provV.querySetId);
  const qver = str(provV.querySetVersion);
  const engine = str(provV.engine);
  const model = str(provV.model);
  const prompt = str(provV.promptVersion);
  const runId = str(v.runId);
  const observedAt = timestamp(v.observedAt);
  const queryText = str(v.queryText);
  const presence = parsePresence(presV);
  const citedSource = parseCited(citedV);
  const competitors = parseComps(compV);
  const pubState =
    pub === 'public' || pub === 'unpublished' || pub === 'private' ? pub : null;
  if (
    !assetId ||
    !isAeoAssetKind(assetV.kind) ||
    !scope ||
    !title ||
    !pubState ||
    ![qid, qver, model, prompt, runId, observedAt, queryText].every(Boolean) ||
    !isCitationEngine(engine) ||
    !presence ||
    !citedSource ||
    !competitors
  ) {
    return null;
  }
  return {
    runId: runId as string,
    observedAt: observedAt as string,
    asset: {
      assetId,
      kind: assetV.kind,
      creatorScopeId: scope,
      title,
      canonicalUrl: str(assetV.canonicalUrl),
      publicationState: pubState,
    },
    provenance: {
      querySetId: qid as string,
      querySetVersion: qver as string,
      engine,
      model: model as string,
      promptVersion: prompt as string,
      market: str(provV.market),
      locale: str(provV.locale),
      creatorLifecycle: str(provV.creatorLifecycle),
    },
    queryText: queryText as string,
    presence,
    citedSource,
    competitors,
  };
}

export function recordAssetObservation(input: {
  readonly observation: unknown;
  readonly consent: AeoAssetConsent | null;
}): RecordResult {
  if (!noId(input.observation)) {
    return {
      ok: false,
      reason: 'asset_observation_contains_disallowed_identifier',
      assetId: rawAssetId(input.observation),
    };
  }
  const observation = parseAeoAssetObservation(input.observation);
  if (!observation) {
    return {
      ok: false,
      reason: 'artist_only_monitor_cannot_satisfy_asset_contract',
      assetId: rawAssetId(input.observation),
    };
  }
  if (
    observation.asset.publicationState !== 'public' &&
    !granted(observation.asset, input.consent, [
      'public_query',
      'private_observation',
    ])
  ) {
    return {
      ok: false,
      reason: 'private_asset_requires_explicit_consent',
      assetId: observation.asset.assetId,
    };
  }
  return { ok: true, observation };
}

export function scoreObservationCompleteness(o: AeoAssetObservation): number {
  let known = 0;
  if (o.presence.status === 'absent') known += 3;
  else if (o.presence.status === 'unknown') known += 1;
  else if (o.presence.status === 'appeared') {
    known += 1;
    if (o.presence.position != null) known += 1;
    if (o.presence.context !== 'unknown') known += 1;
  }
  if (o.citedSource.status === 'known') known += 1;
  if (o.competitors.status === 'known') known += 1;
  return rate(known, 5);
}

function incomparable(
  reason: string,
  mismatchedFields: readonly string[] = []
): AeoComparableTrend {
  return {
    comparable: false,
    direction: 'incomparable',
    delta: null,
    reason,
    mismatchedFields,
  };
}

function trendOf(
  curRate: number,
  cur: AeoQueryProvenance | null,
  prevRate: number | null,
  prev: AeoQueryProvenance | null
): AeoComparableTrend {
  const empty = incomparable('no_comparable_prior_run');
  if (!cur || !prev || prevRate == null) return empty;
  const mismatched = aeoProvenanceMismatches(cur, prev);
  if (mismatched.length > 0)
    return incomparable('provenance_mismatch', mismatched);
  return {
    comparable: true,
    direction: classifyCitationTrend(curRate, prevRate),
    delta: Math.round((curRate - prevRate) * 1000) / 1000,
    reason: 'comparable_query_set',
    mismatchedFields: [],
  };
}

const evidenceFor = (
  runIds: readonly string[],
  field: string
): AeoPrepareOnlyAction['sourceEvidence'] =>
  runIds.map(runId => ({ runId, field }));

function actionsFor(
  report: ActionReport,
  evidence: {
    readonly absentWithCompetitorsRunIds: readonly string[];
    readonly outrankedByRunIds: readonly string[];
  }
): readonly AeoPrepareOnlyAction[] {
  const out: AeoPrepareOnlyAction[] = [];
  if (
    report.visibility.observationCount > 0 &&
    report.visibility.appearanceCount === 0 &&
    evidence.absentWithCompetitorsRunIds.length > 0 &&
    report.competitorComparison.items.length > 0
  ) {
    out.push({
      id: `${report.creatorScopeId}:${report.assetId}:prepare_asset_for_recommendation`,
      kind: 'prepare_asset_for_recommendation',
      mode: 'prepare_only',
      priority: 1,
      title: 'Prepare this asset so answer engines can recommend it',
      rationale: 'Asset did not appear while competitors were recommended.',
      sourceEvidence: [
        ...evidenceFor(evidence.absentWithCompetitorsRunIds, 'presence'),
        ...evidenceFor(evidence.absentWithCompetitorsRunIds, 'competitors'),
      ],
    });
  }
  if (report.competitorComparison.outrankedBy.length > 0) {
    out.push({
      id: `${report.creatorScopeId}:${report.assetId}:prepare_competitive_context`,
      kind: 'prepare_competitive_context',
      mode: 'prepare_only',
      priority: 2,
      title: 'Prepare competitive context for this asset',
      rationale: `Outranked by ${report.competitorComparison.outrankedBy.join(', ')}.`,
      sourceEvidence: evidenceFor(evidence.outrankedByRunIds, 'competitors'),
    });
  }
  return out;
}

type CompetitorCandidate = {
  readonly item: AeoCompetitor;
  readonly runId: string;
};

type AggregatedCompetitor = {
  readonly item: AeoCompetitor;
  readonly runIds: readonly string[];
  readonly evidenceRunIds: readonly string[];
};

function aggregateCompetitors(
  items: readonly CompetitorCandidate[]
): readonly AggregatedCompetitor[] {
  const byName = new Map<
    string,
    {
      item: AeoCompetitor;
      runIds: Set<string>;
      evidenceRunIds: Set<string>;
    }
  >();
  for (const item of items) {
    const existing = byName.get(item.item.name);
    if (!existing) {
      byName.set(item.item.name, {
        item: item.item,
        runIds: new Set([item.runId]),
        evidenceRunIds: new Set([item.runId]),
      });
      continue;
    }

    existing.runIds.add(item.runId);
    if (
      item.item.position != null &&
      (existing.item.position == null ||
        item.item.position < existing.item.position)
    ) {
      existing.item = item.item;
      existing.evidenceRunIds = new Set([item.runId]);
    } else if (
      existing.item.position === item.item.position &&
      existing.item.url === item.item.url &&
      existing.item.platform === item.item.platform
    ) {
      existing.evidenceRunIds.add(item.runId);
    }
  }
  return [...byName.values()].map(item => ({
    item: item.item,
    runIds: [...item.runIds],
    evidenceRunIds: [...item.evidenceRunIds],
  }));
}

const citedSourceScore = (source: AeoCitedSource): number =>
  source.status === 'known'
    ? Number(source.url != null) + Number(source.platform != null)
    : 0;

function latestRun(
  rows: readonly AeoAssetObservation[]
): readonly AeoAssetObservation[] {
  const byRun = new Map<string, AeoAssetObservation[]>();
  for (const row of rows) {
    const list = byRun.get(row.runId) ?? [];
    list.push(row);
    byRun.set(row.runId, list);
  }
  let out: readonly AeoAssetObservation[] = [];
  let latestTime = Number.NEGATIVE_INFINITY;
  let latestId = '';
  for (const group of byRun.values()) {
    const nextTime = Math.max(...group.map(row => Date.parse(row.observedAt)));
    const nextId = group[0]?.runId ?? '';
    if (
      nextTime > latestTime ||
      (nextTime === latestTime && nextId > latestId)
    ) {
      latestTime = nextTime;
      latestId = nextId;
      out = group;
    }
  }
  return out;
}

function summarize(
  rows: readonly AeoAssetObservation[],
  prev: readonly AeoAssetObservation[]
) {
  const first = rows[0];
  let appearedN = 0;
  let absentN = 0;
  let best: number | null = null;
  let ctx: AeoRecommendationContext | 'absent' = 'absent';
  let src = { url: null as string | null, platform: null as string | null };
  let srcScore = 0;
  const comps: CompetitorCandidate[] = [];
  const absentWithCompetitorsRunIds = new Set<string>();
  for (const row of rows) {
    if (row.presence.status === 'appeared') {
      appearedN += 1;
      if (row.presence.position != null) {
        if (best == null || row.presence.position < best) {
          best = row.presence.position;
          ctx = row.presence.context;
        }
      } else if (best == null && ctx === 'absent') {
        ctx = row.presence.context;
      }
    } else if (row.presence.status === 'absent') {
      absentN += 1;
      if (
        row.competitors.status === 'known' &&
        row.competitors.items.length > 0
      ) {
        absentWithCompetitorsRunIds.add(row.runId);
      }
    }
    const nextSourceScore = citedSourceScore(row.citedSource);
    if (row.citedSource.status === 'known' && nextSourceScore > srcScore) {
      src = {
        url: row.citedSource.url,
        platform: row.citedSource.platform,
      };
      srcScore = nextSourceScore;
    }
    if (row.competitors.status === 'known') {
      comps.push(
        ...row.competitors.items.map(item => ({ item, runId: row.runId }))
      );
    }
  }
  const n = rows.length;
  const knownPresenceN = appearedN + absentN;
  const appearanceRate = ratio(appearedN, knownPresenceN);
  const completeness = n
    ? Math.round(
        (rows.reduce((s, row) => s + scoreObservationCompleteness(row), 0) /
          n) *
          1000
      ) / 1000
    : 0;
  const curP = first?.provenance ?? null;
  const mixed =
    curP != null &&
    rows.some(row => !areAeoRunsComparable(curP, row.provenance));
  const mixedFields = curP
    ? uniq(rows.flatMap(row => aeoProvenanceMismatches(curP, row.provenance)))
    : [];
  const prevRun = latestRun(
    prev.filter(row =>
      curP && !mixed ? areAeoRunsComparable(curP, row.provenance) : false
    )
  );
  const prevKnownPresence = prevRun.filter(
    r => r.presence.status === 'appeared' || r.presence.status === 'absent'
  );
  const prevRate = prevKnownPresence.length
    ? ratio(
        prevKnownPresence.filter(r => r.presence.status === 'appeared').length,
        prevKnownPresence.length
      )
    : null;
  const currentTrendRate = ratio(appearedN, knownPresenceN);
  const trend =
    knownPresenceN === 0
      ? incomparable('no_current_presence_measurement')
      : mixed
        ? incomparable('mixed_current_provenance', mixedFields)
        : prev.length > 0 && prevRun.length === 0
          ? trendOf(appearanceRate, curP, null, prev[0]?.provenance ?? null)
          : trendOf(
              currentTrendRate,
              curP,
              prevRate,
              prevRun[0]?.provenance ?? null
            );
  const competitors = aggregateCompetitors(comps);
  const outrankedBy = uniq(
    competitors
      .filter(
        c => best != null && c.item.position != null && c.item.position < best
      )
      .map(c => c.item.name)
  );
  const outrankedByRunIds = uniq(
    competitors.flatMap(c =>
      best != null && c.item.position != null && c.item.position < best
        ? c.evidenceRunIds
        : []
    )
  );
  const recommendationContext: AeoRecommendationContext =
    ctx === 'absent' ? 'unknown' : ctx;
  const draft = {
    variantIdentity: AEO_ASSET_VISIBILITY_VARIANT_IDENTITY,
    assetId: first?.asset.assetId ?? '',
    assetKind: first?.asset.kind ?? 'artist',
    creatorScopeId: first?.asset.creatorScopeId ?? '',
    visibility: {
      appeared: appearedN > 0,
      appearanceCount: appearedN,
      observationCount: n,
      appearanceRate,
    },
    recommendation: { bestPosition: best, context: recommendationContext },
    citedSource: src,
    competitorComparison: {
      items: competitors.map(c => c.item),
      outrankedBy,
      outranks: uniq(
        competitors
          .filter(
            c =>
              best != null && c.item.position != null && c.item.position > best
          )
          .map(c => c.item.name)
      ),
    },
    trend,
    observationCompleteness: completeness,
  };
  return {
    ...draft,
    actions: actionsFor(draft, {
      absentWithCompetitorsRunIds: [...absentWithCompetitorsRunIds],
      outrankedByRunIds,
    }),
  };
}

type Rejected = { readonly reason: string; readonly assetId: string | null };

function consentFor(candidate: unknown, options: AggregateOptions) {
  const rawAsset =
    rec(candidate) && rec(candidate.asset) ? candidate.asset : null;
  const assetId = rawAsset ? str(rawAsset.assetId) : null;
  const creatorScopeId = rawAsset ? str(rawAsset.creatorScopeId) : null;
  const key =
    assetId && creatorScopeId ? JSON.stringify([creatorScopeId, assetId]) : '';
  return assetId
    ? (options.consentByAssetKey?.[key] ??
        options.consentByAssetId?.[assetId] ??
        null)
    : null;
}

export function aggregateAssetVisibility(
  observations: readonly unknown[],
  options: AggregateOptions = {}
) {
  const rejected: Rejected[] = [];
  const accepted: AeoAssetObservation[] = [];
  for (const candidate of observations) {
    const recorded = recordAssetObservation({
      observation: candidate,
      consent: consentFor(candidate, options),
    });
    if (!recorded.ok) {
      rejected.push({ reason: recorded.reason, assetId: recorded.assetId });
      continue;
    }
    accepted.push(recorded.observation);
  }
  const prev = (options.previous ?? []).flatMap(c => {
    const recorded = recordAssetObservation({
      observation: c,
      consent: consentFor(c, options),
    });
    return recorded.ok ? [recorded.observation] : [];
  });
  const byAsset = new Map<string, AeoAssetObservation[]>();
  for (const row of accepted) {
    const key = assetKey(row.asset);
    const list = byAsset.get(key) ?? [];
    list.push(row);
    byAsset.set(key, list);
  }
  return {
    variantIdentity: AEO_ASSET_VISIBILITY_VARIANT_IDENTITY,
    reports: [...byAsset.values()].map(rows => {
      const first = rows[0];
      return summarize(
        rows,
        first
          ? prev.filter(row => assetKey(row.asset) === assetKey(first.asset))
          : []
      );
    }),
    rejected,
  };
}
