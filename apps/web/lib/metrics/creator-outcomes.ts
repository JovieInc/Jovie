/**
 * Creator outcomes (JOV-6584).
 *
 * Verified money, attributed engagement, and causal lift stay distinct.
 * This module never emits a blended score and never dollarizes clicks or fans
 * into verified money or causal lift.
 *
 * Pure logic — no DB, network, or analytics-vendor I/O.
 */

export const CREATOR_OUTCOME_CONTRACT = 'creator-outcomes:v1' as const;

export const CREATOR_OUTCOME_LAYERS = [
  'verified_money',
  'attributed_engagement',
  'causal_lift',
] as const;

export type CreatorOutcomeLayer = (typeof CREATOR_OUTCOME_LAYERS)[number];

export type CreatorOutcomeMetricStatus =
  | 'measured'
  | 'unmeasured'
  | 'inconclusive';

export const CREATOR_OUTCOME_METRIC_CATALOG = {
  verified_gmv_cents: {
    layer: 'verified_money',
    unit: 'cents',
    label: 'Verified GMV',
  },
  verified_tips_cents: {
    layer: 'verified_money',
    unit: 'cents',
    label: 'Verified tips',
  },
  attributed_clicks: {
    layer: 'attributed_engagement',
    unit: 'count',
    label: 'Attributed clicks',
  },
  attributed_dsp_clicks: {
    layer: 'attributed_engagement',
    unit: 'count',
    label: 'Attributed listens',
  },
  attributed_new_fans: {
    layer: 'attributed_engagement',
    unit: 'count',
    label: 'Attributed new fans',
  },
  causal_verified_money_lift_cents: {
    layer: 'causal_lift',
    unit: 'cents',
    label: 'Causal verified-money lift',
  },
} as const;

export type CreatorOutcomeMetricKey =
  keyof typeof CREATOR_OUTCOME_METRIC_CATALOG;

export type CreatorOutcomeMetric<
  K extends CreatorOutcomeMetricKey = CreatorOutcomeMetricKey,
> = {
  readonly key: K;
  readonly layer: (typeof CREATOR_OUTCOME_METRIC_CATALOG)[K]['layer'];
  readonly unit: (typeof CREATOR_OUTCOME_METRIC_CATALOG)[K]['unit'];
  readonly label: (typeof CREATOR_OUTCOME_METRIC_CATALOG)[K]['label'];
  readonly status: CreatorOutcomeMetricStatus;
  readonly value: number | null;
};

export type CreatorOutcomeMeasurement = {
  readonly contract: typeof CREATOR_OUTCOME_CONTRACT;
  readonly verifiedMoney: readonly CreatorOutcomeMetric[];
  readonly attributedEngagement: readonly CreatorOutcomeMetric[];
  readonly causalLift: readonly CreatorOutcomeMetric[];
};

export type CreatorOutcomeDashboardInput = {
  readonly verifiedGmvCents?: number | null;
  readonly verifiedTipsCents?: number | null;
  readonly attributedClicks?: number | null;
  readonly attributedDspClicks?: number | null;
  readonly attributedNewFans?: number | null;
  readonly causalVerifiedMoneyLiftCents?: number | null;
  readonly causalStatus?: CreatorOutcomeMetricStatus;
};

const CROSS_LAYER_ERROR = 'creator_outcome_layers_must_remain_distinct';
const LAYER_MISMATCH_ERROR = 'creator_outcome_metric_layer_mismatch';
const PROXY_IN_MONEY_ERROR = 'creator_outcome_verified_money_includes_proxy';

const VERIFIED_MONEY_DISCLOSURE =
  'Settled GMV and tips only. Clicks, fans, and proxy weights are not verified money.';
const ENGAGEMENT_DISCLOSURE =
  'Counts inside the attribution window. Not revenue and not causal lift.';
const CAUSAL_MEASURED_DISCLOSURE =
  'Change in verified money versus a comparable baseline. Engagement is excluded.';
const CAUSAL_INCONCLUSIVE_DISCLOSURE =
  'Inconclusive until verified money has a comparable baseline.';
const CAUSAL_UNMEASURED_DISCLOSURE =
  'A comparable window exists, but verified money in that window was not measured.';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function outcomeWindowDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function isCreatorOutcomeLayer(
  value: unknown
): value is CreatorOutcomeLayer {
  return (
    value === 'verified_money' ||
    value === 'attributed_engagement' ||
    value === 'causal_lift'
  );
}

export function layerForCreatorOutcomeMetric(
  key: CreatorOutcomeMetricKey
): (typeof CREATOR_OUTCOME_METRIC_CATALOG)[CreatorOutcomeMetricKey]['layer'] {
  return CREATOR_OUTCOME_METRIC_CATALOG[key].layer;
}

export function assertSingleCreatorOutcomeLayer(
  metrics: readonly Pick<CreatorOutcomeMetric, 'layer'>[]
): CreatorOutcomeLayer {
  const layers = new Set(metrics.map(metric => metric.layer));
  if (layers.size !== 1) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  const [layer] = layers;
  if (!isCreatorOutcomeLayer(layer)) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  return layer;
}

/**
 * Fail closed when a blended signal that still contains engagement proxies is
 * presented as verified money.
 */
export function assertVerifiedMoneyExcludesProxies(input: {
  readonly verifiedMoneyCents: number;
  readonly blendedSignalCents: number;
  readonly engagementProxyCents: number;
}): void {
  if (
    input.engagementProxyCents !== 0 &&
    input.verifiedMoneyCents === input.blendedSignalCents
  ) {
    throw new Error(PROXY_IN_MONEY_ERROR);
  }
}

export function resolveCausalVerifiedMoneyLift(input: {
  readonly currentGmvCents: number | null;
  readonly currentTipsCents: number | null;
  readonly baselineGmvCents: number | null;
  readonly baselineTipsCents: number | null;
  readonly windowDays: number;
  readonly baselineWindowDays: number;
}): {
  readonly cents: number | null;
  readonly status: CreatorOutcomeMetricStatus;
} {
  if (input.windowDays !== input.baselineWindowDays) {
    return { cents: null, status: 'inconclusive' };
  }
  if (
    input.currentGmvCents == null ||
    input.currentTipsCents == null ||
    input.baselineGmvCents == null ||
    input.baselineTipsCents == null
  ) {
    return { cents: null, status: 'unmeasured' };
  }
  return {
    cents:
      input.currentGmvCents +
      input.currentTipsCents -
      (input.baselineGmvCents + input.baselineTipsCents),
    status: 'measured',
  };
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metric<K extends CreatorOutcomeMetricKey>(
  key: K,
  value: number | null | undefined,
  statusOverride?: CreatorOutcomeMetricStatus
): CreatorOutcomeMetric<K> {
  const catalog = CREATOR_OUTCOME_METRIC_CATALOG[key];
  const measured = finiteOrNull(value);
  const status =
    statusOverride ?? (measured == null ? 'unmeasured' : 'measured');
  return {
    key,
    layer: catalog.layer,
    unit: catalog.unit,
    label: catalog.label,
    status,
    value: status === 'measured' ? measured : null,
  };
}

export function buildCreatorOutcomeMeasurement(
  input: CreatorOutcomeDashboardInput = {}
): CreatorOutcomeMeasurement {
  const causalStatus = input.causalStatus ?? 'inconclusive';
  return {
    contract: CREATOR_OUTCOME_CONTRACT,
    verifiedMoney: [
      metric('verified_gmv_cents', input.verifiedGmvCents),
      metric('verified_tips_cents', input.verifiedTipsCents),
    ],
    attributedEngagement: [
      metric('attributed_clicks', input.attributedClicks),
      metric('attributed_dsp_clicks', input.attributedDspClicks),
      metric('attributed_new_fans', input.attributedNewFans),
    ],
    causalLift: [
      metric(
        'causal_verified_money_lift_cents',
        causalStatus === 'measured' ? input.causalVerifiedMoneyLiftCents : null,
        causalStatus === 'measured' &&
          finiteOrNull(input.causalVerifiedMoneyLiftCents) == null
          ? 'unmeasured'
          : causalStatus
      ),
    ],
  };
}

export function assertCreatorOutcomeMetricLayer<
  K extends CreatorOutcomeMetricKey,
>(
  metricValue: CreatorOutcomeMetric<K>,
  expectedLayer: CreatorOutcomeLayer
): void {
  if (metricValue.layer !== expectedLayer) {
    throw new Error(LAYER_MISMATCH_ERROR);
  }
}

export interface CreatorOutcomeLayerCard {
  readonly id: 'verified-money' | 'attributed-engagement' | 'causal-lift';
  readonly layer: CreatorOutcomeLayer;
  readonly label: string;
  readonly valueLabel: string;
  readonly status: CreatorOutcomeMetricStatus;
  readonly statusLabel: string;
  readonly disclosure: string;
}

export interface CreatorOutcomePresentation {
  readonly contract: typeof CREATOR_OUTCOME_CONTRACT;
  readonly layers: readonly [
    CreatorOutcomeLayerCard,
    CreatorOutcomeLayerCard,
    CreatorOutcomeLayerCard,
  ];
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatCount(value: number, singular: string, plural: string): string {
  const label = value === 1 ? singular : plural;
  return `${new Intl.NumberFormat('en-US').format(value)} ${label}`;
}

function statusLabel(status: CreatorOutcomeMetricStatus): string {
  if (status === 'measured') return 'Measured';
  if (status === 'inconclusive') return 'Inconclusive';
  return 'Unmeasured';
}

function verifiedMoneyCard(
  measurement: CreatorOutcomeMeasurement
): CreatorOutcomeLayerCard {
  const gmv = measurement.verifiedMoney[0];
  const tips = measurement.verifiedMoney[1];
  if (!gmv || !tips) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  const measured = [gmv, tips].filter(item => item.status === 'measured');
  const cents = measured.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const tipsNote =
    tips.status === 'unmeasured' ? ' Tips are unmeasured on this surface.' : '';
  return {
    id: 'verified-money',
    layer: 'verified_money',
    label: 'Verified money',
    valueLabel: measured.length === 0 ? '—' : formatCents(cents),
    status: measured.length === 0 ? 'unmeasured' : 'measured',
    statusLabel: measured.length === 0 ? 'Unmeasured' : 'Measured',
    disclosure: `${VERIFIED_MONEY_DISCLOSURE}${tipsNote}`,
  };
}

function engagementCard(
  measurement: CreatorOutcomeMeasurement
): CreatorOutcomeLayerCard {
  const [clicks, listens, fans] = measurement.attributedEngagement;
  if (!clicks || !listens || !fans) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  const parts = [
    clicks.status === 'measured' && clicks.value != null
      ? formatCount(clicks.value, 'click', 'clicks')
      : null,
    listens.status === 'measured' && listens.value != null
      ? formatCount(listens.value, 'listen', 'listens')
      : null,
    fans.status === 'measured' && fans.value != null
      ? formatCount(fans.value, 'fan', 'fans')
      : null,
  ].filter((part): part is string => part != null);
  const measuredValues = [clicks, listens, fans]
    .filter(item => item.status === 'measured')
    .map(item => item.value ?? 0);
  const valueLabel =
    parts.length === 0
      ? '—'
      : measuredValues.every(value => value === 0)
        ? 'None'
        : parts.filter(part => !part.startsWith('0 ')).join(' · ');
  return {
    id: 'attributed-engagement',
    layer: 'attributed_engagement',
    label: 'Attributed engagement',
    valueLabel,
    status: parts.length === 0 ? 'unmeasured' : 'measured',
    statusLabel: parts.length === 0 ? 'Unmeasured' : 'Measured',
    disclosure: ENGAGEMENT_DISCLOSURE,
  };
}

function causalCard(
  measurement: CreatorOutcomeMeasurement
): CreatorOutcomeLayerCard {
  const causal = measurement.causalLift[0];
  if (!causal) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  const disclosure =
    causal.status === 'measured'
      ? CAUSAL_MEASURED_DISCLOSURE
      : causal.status === 'unmeasured'
        ? CAUSAL_UNMEASURED_DISCLOSURE
        : CAUSAL_INCONCLUSIVE_DISCLOSURE;
  return {
    id: 'causal-lift',
    layer: 'causal_lift',
    label: 'Causal lift',
    valueLabel:
      causal.status === 'measured' && causal.value != null
        ? formatCents(causal.value)
        : '—',
    status: causal.status,
    statusLabel: statusLabel(causal.status),
    disclosure,
  };
}

export function presentCreatorOutcomeDashboard(
  input: CreatorOutcomeDashboardInput = {}
): CreatorOutcomePresentation {
  const measurement = buildCreatorOutcomeMeasurement(input);
  return {
    contract: CREATOR_OUTCOME_CONTRACT,
    layers: [
      verifiedMoneyCard(measurement),
      engagementCard(measurement),
      causalCard(measurement),
    ],
  };
}

export interface CreatorWorkOutcomeLines {
  readonly verifiedMoneyLabel: string;
  readonly verifiedMoneyValue: string;
  readonly engagementLabel: string;
  readonly engagementValue: string;
  readonly causalLiftLabel: string;
  readonly causalLiftValue: string;
  readonly causalLiftDisclosure: string;
}

/** Work-feed rows have GMV and engagement counts, and no comparable baseline. */
export function describeCreatorWorkOutcome(input: {
  readonly gmvDeltaCents: number;
  readonly clickDelta: number;
  readonly dspClickDelta: number;
  readonly newFansDelta: number;
}): CreatorWorkOutcomeLines {
  const presentation = presentCreatorOutcomeDashboard({
    verifiedGmvCents: input.gmvDeltaCents,
    verifiedTipsCents: null,
    attributedClicks: input.clickDelta,
    attributedDspClicks: input.dspClickDelta,
    attributedNewFans: input.newFansDelta,
    causalStatus: 'inconclusive',
  });
  const [money, engagement, causal] = presentation.layers;
  return {
    verifiedMoneyLabel: money.label,
    verifiedMoneyValue: money.valueLabel,
    engagementLabel: engagement.label,
    engagementValue: engagement.valueLabel,
    causalLiftLabel: causal.label,
    causalLiftValue: causal.statusLabel,
    causalLiftDisclosure: causal.disclosure,
  };
}
