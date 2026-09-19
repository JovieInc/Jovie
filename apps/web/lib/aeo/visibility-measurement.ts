/**
 * AI Visibility measurement layers (JOV-6243).
 *
 * Readiness, observed visibility, and business outcomes stay distinct.
 * This module never emits a blended "visibility score".
 *
 * Pure logic — no DB, network, or analytics-vendor I/O.
 */

export const AI_VISIBILITY_MEASUREMENT_CONTRACT =
  'ai-visibility-measurement:v1' as const;

export const AI_VISIBILITY_LAYERS = [
  'readiness',
  'observed_visibility',
  'business_outcome',
] as const;

export type AiVisibilityLayer = (typeof AI_VISIBILITY_LAYERS)[number];

export type AiVisibilityMetricStatus = 'measured' | 'unmeasured' | 'ineligible';

export type AiVisibilityUnit = 'count' | 'rate' | 'rank' | 'cents' | 'flag';

export const AI_VISIBILITY_METRIC_CATALOG = {
  profile_published: {
    layer: 'readiness',
    unit: 'flag',
    label: 'Profile published',
  },
  ai_crawlers_allowed: {
    layer: 'readiness',
    unit: 'flag',
    label: 'AI crawlers allowed',
  },
  brand_integrity_ready: {
    layer: 'readiness',
    unit: 'flag',
    label: 'Brand integrity ready',
  },
  crawler_reads: {
    layer: 'observed_visibility',
    unit: 'count',
    label: 'AI crawler reads',
  },
  weekly_crawler_reads: {
    layer: 'observed_visibility',
    unit: 'count',
    label: 'Weekly AI crawler reads',
  },
  citation_appearance_rate: {
    layer: 'observed_visibility',
    unit: 'rate',
    label: 'Citation appearance rate',
  },
  answer_rank: {
    layer: 'observed_visibility',
    unit: 'rank',
    label: 'Answer rank',
  },
  attributed_gmv_cents: {
    layer: 'business_outcome',
    unit: 'cents',
    label: 'Attributed GMV',
  },
  paid_conversions: {
    layer: 'business_outcome',
    unit: 'count',
    label: 'Paid conversions',
  },
} as const;

export type AiVisibilityMetricKey = keyof typeof AI_VISIBILITY_METRIC_CATALOG;

export type AiVisibilityMetric<
  K extends AiVisibilityMetricKey = AiVisibilityMetricKey,
> = {
  readonly key: K;
  readonly layer: (typeof AI_VISIBILITY_METRIC_CATALOG)[K]['layer'];
  readonly unit: (typeof AI_VISIBILITY_METRIC_CATALOG)[K]['unit'];
  readonly label: (typeof AI_VISIBILITY_METRIC_CATALOG)[K]['label'];
  readonly status: AiVisibilityMetricStatus;
  readonly value: number | boolean | null;
};

export type AiVisibilityMeasurement = {
  readonly contract: typeof AI_VISIBILITY_MEASUREMENT_CONTRACT;
  readonly readiness: readonly AiVisibilityMetric[];
  readonly observedVisibility: readonly AiVisibilityMetric[];
  readonly businessOutcome: readonly AiVisibilityMetric[];
};

export type AiVisibilityReadinessInput = {
  readonly profilePublished?: boolean;
  readonly aiCrawlersAllowed?: boolean;
  readonly brandIntegrityReady?: boolean;
};

export type AiVisibilityObservedInput = {
  readonly crawlerReads?: number | null;
  readonly weeklyCrawlerReads?: number | null;
  readonly citationAppearanceRate?: number | null;
  readonly answerRank?: number | null;
};

export type AiVisibilityOutcomeInput = {
  readonly attributedGmvCents?: number | null;
  readonly paidConversions?: number | null;
};

const CROSS_LAYER_ERROR = 'ai_visibility_layers_must_remain_distinct';
const MISSING_METRIC_ERROR = 'ai_visibility_metric_unmeasured';
const LAYER_MISMATCH_ERROR = 'ai_visibility_metric_layer_mismatch';

const READINESS_KEYS = [
  'profile_published',
  'ai_crawlers_allowed',
  'brand_integrity_ready',
] as const satisfies readonly AiVisibilityMetricKey[];

const OBSERVED_KEYS = [
  'crawler_reads',
  'weekly_crawler_reads',
  'citation_appearance_rate',
  'answer_rank',
] as const satisfies readonly AiVisibilityMetricKey[];

const OUTCOME_KEYS = [
  'attributed_gmv_cents',
  'paid_conversions',
] as const satisfies readonly AiVisibilityMetricKey[];

export function isAiVisibilityLayer(
  value: unknown
): value is AiVisibilityLayer {
  return (
    value === 'readiness' ||
    value === 'observed_visibility' ||
    value === 'business_outcome'
  );
}

export function isAiVisibilityMetricKey(
  value: unknown
): value is AiVisibilityMetricKey {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(AI_VISIBILITY_METRIC_CATALOG, value)
  );
}

export function layerForAiVisibilityMetric(
  key: AiVisibilityMetricKey
): (typeof AI_VISIBILITY_METRIC_CATALOG)[AiVisibilityMetricKey]['layer'] {
  return AI_VISIBILITY_METRIC_CATALOG[key].layer;
}

export function assertSingleAiVisibilityLayer(
  metrics: readonly Pick<AiVisibilityMetric, 'layer'>[]
): AiVisibilityLayer {
  const layers = new Set(metrics.map(metric => metric.layer));
  if (layers.size !== 1) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  const [layer] = layers;
  if (!isAiVisibilityLayer(layer)) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  return layer;
}

function metric<K extends AiVisibilityMetricKey>(
  key: K,
  value: number | boolean | null | undefined
): AiVisibilityMetric<K> {
  const catalog = AI_VISIBILITY_METRIC_CATALOG[key];
  const measured =
    value !== undefined &&
    value !== null &&
    (typeof value === 'boolean' || Number.isFinite(value));
  return {
    key,
    layer: catalog.layer,
    unit: catalog.unit,
    label: catalog.label,
    status: measured ? 'measured' : 'unmeasured',
    value: measured ? value : null,
  };
}

function pickLayer(
  metrics: readonly AiVisibilityMetric[],
  layer: AiVisibilityLayer
): readonly AiVisibilityMetric[] {
  return metrics.filter(item => item.layer === layer);
}

export function buildAiVisibilityMeasurement(
  input: {
    readonly readiness?: AiVisibilityReadinessInput;
    readonly observed?: AiVisibilityObservedInput;
    readonly outcome?: AiVisibilityOutcomeInput;
  } = {}
): AiVisibilityMeasurement {
  const readiness = input.readiness ?? {};
  const observed = input.observed ?? {};
  const outcome = input.outcome ?? {};

  const metrics: readonly AiVisibilityMetric[] = [
    metric('profile_published', readiness.profilePublished),
    metric('ai_crawlers_allowed', readiness.aiCrawlersAllowed),
    metric('brand_integrity_ready', readiness.brandIntegrityReady),
    metric('crawler_reads', observed.crawlerReads),
    metric('weekly_crawler_reads', observed.weeklyCrawlerReads),
    metric('citation_appearance_rate', observed.citationAppearanceRate),
    metric('answer_rank', observed.answerRank),
    metric('attributed_gmv_cents', outcome.attributedGmvCents),
    metric('paid_conversions', outcome.paidConversions),
  ];

  const snapshot: AiVisibilityMeasurement = {
    contract: AI_VISIBILITY_MEASUREMENT_CONTRACT,
    readiness: pickLayer(metrics, 'readiness'),
    observedVisibility: pickLayer(metrics, 'observed_visibility'),
    businessOutcome: pickLayer(metrics, 'business_outcome'),
  };

  if (snapshot.readiness.length !== READINESS_KEYS.length) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  if (snapshot.observedVisibility.length !== OBSERVED_KEYS.length) {
    throw new Error(CROSS_LAYER_ERROR);
  }
  if (snapshot.businessOutcome.length !== OUTCOME_KEYS.length) {
    throw new Error(CROSS_LAYER_ERROR);
  }

  return snapshot;
}

export function getAiVisibilityMetric<K extends AiVisibilityMetricKey>(
  measurement: AiVisibilityMeasurement,
  key: K
): AiVisibilityMetric<K> {
  const all = [
    ...measurement.readiness,
    ...measurement.observedVisibility,
    ...measurement.businessOutcome,
  ];
  const found = all.find(
    (item): item is AiVisibilityMetric<K> => item.key === key
  );
  if (!found) {
    throw new Error(MISSING_METRIC_ERROR);
  }
  return found;
}

export function requireMeasuredAiVisibilityMetric<
  K extends AiVisibilityMetricKey,
>(
  measurement: AiVisibilityMeasurement,
  key: K,
  expectedLayer: AiVisibilityLayer
): AiVisibilityMetric<K> & { readonly status: 'measured' } {
  const found = getAiVisibilityMetric(measurement, key);
  if (found.layer !== expectedLayer) {
    throw new Error(LAYER_MISMATCH_ERROR);
  }
  if (found.status !== 'measured') {
    throw new Error(MISSING_METRIC_ERROR);
  }
  return found as AiVisibilityMetric<K> & { readonly status: 'measured' };
}

export function summarizeAiVisibilityLayers(
  measurement: AiVisibilityMeasurement
): {
  readonly contract: typeof AI_VISIBILITY_MEASUREMENT_CONTRACT;
  readonly readiness: 'ready' | 'not_ready' | 'unmeasured';
  readonly observedVisibility: 'observed' | 'collecting' | 'unmeasured';
  readonly businessOutcome: 'attributed' | 'unmeasured';
} {
  const readinessMeasured = measurement.readiness.filter(
    item => item.status === 'measured'
  );
  const observedMeasured = measurement.observedVisibility.filter(
    item => item.status === 'measured'
  );
  const outcomeMeasured = measurement.businessOutcome.filter(
    item => item.status === 'measured'
  );

  return {
    contract: measurement.contract,
    readiness:
      readinessMeasured.length === 0
        ? 'unmeasured'
        : readinessMeasured.every(item => item.value === true)
          ? 'ready'
          : 'not_ready',
    observedVisibility:
      observedMeasured.length === 0
        ? 'unmeasured'
        : observedMeasured.some(
              item => typeof item.value === 'number' && item.value > 0
            )
          ? 'observed'
          : 'collecting',
    businessOutcome: outcomeMeasured.length === 0 ? 'unmeasured' : 'attributed',
  };
}
