import { computeRatePercent } from '@/lib/analytics/metrics';
import { canonicalizeSurfaceUrl } from '@/lib/profile-surfaces/contracts';
import type { CitationEngine } from './citation-monitor';

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
  intent.replace(/_/g, '-');

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
const compareAveragePosition = (
  currentAverage: number | null,
  previousAverage: number | null
) => {
  if (currentAverage !== null && previousAverage !== null)
    return round(previousAverage - currentAverage);
  if (currentAverage !== null) return 1;
  if (previousAverage !== null) return -1;
  return null;
};
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
    compareAveragePosition(currentSummary.averagePosition, old.averagePosition),
    compareRankCoverage(current, previous)
  );
  const rateStatus =
    rateDelta > 0.05 ? 'up' : rateDelta < -0.05 ? 'down' : 'steady';
  const rankStatus =
    (positionDelta ?? 0) > 0.5
      ? 'up'
      : (positionDelta ?? 0) < -0.5
        ? 'down'
        : 'steady';
  const status =
    rateStatus === 'down' || rankStatus === 'down'
      ? 'down'
      : rateStatus === 'up' || rankStatus === 'up'
        ? 'up'
        : 'steady';
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
