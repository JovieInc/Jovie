import { z } from 'zod';
import {
  CANONICAL_METRICS,
  type CanonicalMetricKey,
  computeRatePercent,
} from '@/lib/analytics/metrics';

export const LIMITED_DROP_FUNNEL_CONTRACT_VERSION =
  'limited-drop-funnel/v1' as const;
export const LIMITED_DROP_EVENT_NAMES = [
  'asset_page_viewed',
  'drop_countdown_viewed',
  'drop_capture_started',
  'drop_capture_submitted',
  'drop_marketing_consent_granted',
  'drop_purchase_started',
  'drop_purchase_completed',
  'drop_terminal_reached',
  'profile_card_impression',
  'profile_card_clicked',
  'completed_drop_card_exposure',
  'completed_drop_signup',
] as const;
export type LimitedDropEventName = (typeof LIMITED_DROP_EVENT_NAMES)[number];
export const LIMITED_DROP_PAGE_IDS = [
  'asset_page',
  'drop_page',
  'terminal_page',
  'profile_page',
] as const;
export const LIMITED_DROP_STATES = [
  'normal_item',
  'countdown',
  'capture',
  'purchase',
  'expired',
  'sold_out',
  'completed_card',
] as const;
export const LIMITED_DROP_CARD_PLACEMENTS = [
  'none',
  'asset_primary',
  'drop_primary',
  'terminal_page',
  'profile_primary',
  'completed_drop_profile',
] as const;
export const LIMITED_DROP_ITEM_MODES = [
  'normal',
  'active_drop',
  'completed_drop',
] as const;
export const LIMITED_DROP_CONSENT_CHANNELS = ['email', 'sms'] as const;
export const LIMITED_DROP_TERMINAL_REASONS = ['expired', 'sold_out'] as const;
const opaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9._:-]*$/i, 'must be an opaque prefixed identifier');

export const limitedDropEventSchema = z
  .object({
    contract_version: z.literal(LIMITED_DROP_FUNNEL_CONTRACT_VERSION),
    event_name: z.enum(LIMITED_DROP_EVENT_NAMES),
    event_id: z.string().uuid(),
    session_id: z.string().uuid(),
    artist_id: z.string().uuid(),
    asset_id: z.string().uuid().nullable(),
    drop_id: z.string().uuid().nullable(),
    page_id: z.enum(LIMITED_DROP_PAGE_IDS),
    state: z.enum(LIMITED_DROP_STATES),
    card_placement: z.enum(LIMITED_DROP_CARD_PLACEMENTS),
    share_id: opaqueIdSchema.nullable(),
    campaign_id: opaqueIdSchema.nullable(),
    experiment_id: opaqueIdSchema.nullable(),
    variant_id: opaqueIdSchema.nullable(),
    item_mode: z.enum(LIMITED_DROP_ITEM_MODES),
    channel: z.enum(LIMITED_DROP_CONSENT_CHANNELS).nullable(),
    terminal_reason: z.enum(LIMITED_DROP_TERMINAL_REASONS).nullable(),
    occurred_at: z.string().datetime(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.asset_id === null && event.drop_id === null) {
      context.addIssue({
        code: 'custom',
        message: 'asset_id or drop_id is required',
        path: ['drop_id'],
      });
    }
    const consentEvent = event.event_name === 'drop_marketing_consent_granted';
    if (consentEvent !== (event.channel !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'channel is required only for consent events',
        path: ['channel'],
      });
    }
    const terminalEvent = event.event_name === 'drop_terminal_reached';
    if (terminalEvent !== (event.terminal_reason !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'terminal_reason is required only for terminal events',
        path: ['terminal_reason'],
      });
    }
    if (terminalEvent && event.terminal_reason !== event.state) {
      context.addIssue({
        code: 'custom',
        message: 'terminal_reason must match the terminal state',
        path: ['terminal_reason'],
      });
    }
    if (
      event.event_name === 'completed_drop_card_exposure' &&
      (event.page_id !== 'profile_page' ||
        event.card_placement !== 'completed_drop_profile')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'completed card exposure must identify its profile placement',
        path: ['card_placement'],
      });
    }
    if (
      event.event_name === 'completed_drop_signup' &&
      event.card_placement !== 'terminal_page' &&
      event.card_placement !== 'completed_drop_profile'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'completed drop signup must identify its signup placement',
        path: ['card_placement'],
      });
    }
  });

export type LimitedDropEvent = z.infer<typeof limitedDropEventSchema>;
export interface StoredLimitedDropEvent extends LimitedDropEvent {
  readonly ingested_at: string;
}
export const LIMITED_DROP_FRESHNESS_TARGET_MINUTES = 15;
export type LimitedDropMetricKey = Extract<
  CanonicalMetricKey,
  | 'normal_item_purchase_rate'
  | 'active_drop_purchase_rate'
  | 'terminal_page_signup_rate'
  | 'completed_card_signup_rate'
  | 'completed_drop_profile_signup_rate'
>;
export interface LimitedDropMetricDefinition {
  readonly population: string;
  readonly denominator: string;
  readonly deduplication: string;
  readonly freshness: string;
}
const SESSION_ITEM_DEDUPE =
  'Unique by artist_id + (drop_id or asset_id) + session_id inside the resolved window.';

export const LIMITED_DROP_METRIC_DEFINITIONS: Readonly<
  Record<LimitedDropMetricKey, LimitedDropMetricDefinition>
> = {
  normal_item_purchase_rate: {
    population: 'Valid events with item_mode=normal in the resolved window.',
    denominator: 'Unique normal-item asset_page_viewed sessions.',
    deduplication: SESSION_ITEM_DEDUPE,
    freshness: `Server-ledger ingestion lag must be at most ${LIMITED_DROP_FRESHNESS_TARGET_MINUTES} minutes.`,
  },
  active_drop_purchase_rate: {
    population:
      'Valid events with item_mode=active_drop in the resolved window.',
    denominator: 'Unique active-drop asset_page_viewed sessions.',
    deduplication: SESSION_ITEM_DEDUPE,
    freshness: `Server-ledger ingestion lag must be at most ${LIMITED_DROP_FRESHNESS_TARGET_MINUTES} minutes.`,
  },
  terminal_page_signup_rate: {
    population:
      'Visitors who reached an expired or sold-out drop in the resolved window.',
    denominator: 'Unique drop_terminal_reached sessions.',
    deduplication: SESSION_ITEM_DEDUPE,
    freshness: `Server-ledger ingestion lag must be at most ${LIMITED_DROP_FRESHNESS_TARGET_MINUTES} minutes.`,
  },
  completed_card_signup_rate: {
    population:
      'Visitors exposed to a completed-drop profile card in the resolved window.',
    denominator: 'Unique completed_drop_card_exposure sessions.',
    deduplication: SESSION_ITEM_DEDUPE,
    freshness: `Server-ledger ingestion lag must be at most ${LIMITED_DROP_FRESHNESS_TARGET_MINUTES} minutes.`,
  },
  completed_drop_profile_signup_rate: {
    population:
      'Eligible profile-card impressions in one completed-card experiment arm.',
    denominator: 'Unique profile_card_impression sessions.',
    deduplication: SESSION_ITEM_DEDUPE,
    freshness: `Server-ledger ingestion lag must be at most ${LIMITED_DROP_FRESHNESS_TARGET_MINUTES} minutes.`,
  },
};

export interface LimitedDropMetricReceipt {
  readonly metric: LimitedDropMetricKey;
  readonly definition_version: string;
  readonly numerator: number;
  readonly denominator: number;
  readonly rate_percent: number | null;
  readonly availability: 'measured' | 'unknown';
}

export interface LimitedDropReadModel {
  readonly contract_version: typeof LIMITED_DROP_FUNNEL_CONTRACT_VERSION;
  readonly window: { readonly start: string; readonly end: string };
  readonly observed_at: string;
  readonly filters: {
    readonly artist_id?: string;
    readonly drop_id?: string;
    readonly experiment_id?: string;
    readonly variant_id?: string;
  };
  readonly source: 'server_analytics_events';
  readonly freshness: {
    readonly target_minutes: typeof LIMITED_DROP_FRESHNESS_TARGET_MINUTES;
    readonly status: 'fresh' | 'stale' | 'unknown';
    readonly source_as_of: string | null;
    readonly max_ingestion_lag_minutes: number | null;
  };
  readonly quality: {
    readonly invalid_events_rejected: number;
    readonly duplicate_events_dropped: number;
    readonly population_invariant_violations: readonly LimitedDropMetricKey[];
  };
  readonly event_counts: Readonly<Record<LimitedDropEventName, number>>;
  readonly populations: {
    readonly profile_card_impressions: number;
    readonly completed_card_exposures: number;
  };
  readonly metrics: Readonly<
    Record<LimitedDropMetricKey, LimitedDropMetricReceipt>
  >;
}

export interface LimitedDropReadModelInput {
  readonly start: Date;
  readonly end: Date;
  readonly observedAt?: Date;
  readonly artistId?: string;
  readonly dropId?: string;
  readonly experimentId?: string;
  readonly variantId?: string;
}

function parseStoredEvent(value: unknown): StoredLimitedDropEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { ingested_at: ingestedAt, ...rawEvent } = value as Record<
    string,
    unknown
  >;
  const parsed = limitedDropEventSchema.safeParse(rawEvent);
  if (!parsed.success || typeof ingestedAt !== 'string') return null;
  if (!Number.isFinite(new Date(ingestedAt).getTime())) return null;
  return { ...parsed.data, ingested_at: ingestedAt };
}

function eventDedupeKey(event: LimitedDropEvent): string {
  return [
    event.artist_id,
    event.drop_id ?? event.asset_id,
    event.session_id,
  ].join(':');
}

function countUnique(
  events: readonly StoredLimitedDropEvent[],
  predicate: (event: StoredLimitedDropEvent) => boolean
): number {
  return new Set(events.filter(predicate).map(eventDedupeKey)).size;
}

function metricReceipt(
  metric: LimitedDropMetricKey,
  numerator: number,
  denominator: number
): LimitedDropMetricReceipt {
  return {
    metric,
    definition_version: CANONICAL_METRICS[metric].version,
    numerator,
    denominator,
    rate_percent:
      denominator > 0 ? computeRatePercent(numerator, denominator, 2) : null,
    availability: denominator > 0 ? 'measured' : 'unknown',
  };
}

function emptyEventCounts(): Record<LimitedDropEventName, number> {
  return Object.fromEntries(
    LIMITED_DROP_EVENT_NAMES.map(eventName => [eventName, 0])
  ) as Record<LimitedDropEventName, number>;
}

export function buildLimitedDropReadModel(
  rawEvents: readonly unknown[],
  input: LimitedDropReadModelInput
): LimitedDropReadModel {
  const startMs = input.start.getTime();
  const endMs = input.end.getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    throw new RangeError('Limited-drop read-model window must be valid');
  }

  let invalidEvents = 0;
  const parsedEvents: StoredLimitedDropEvent[] = [];
  for (const rawEvent of rawEvents) {
    const event = parseStoredEvent(rawEvent);
    if (event) parsedEvents.push(event);
    else invalidEvents += 1;
  }

  const scoped = parsedEvents.filter(event => {
    const occurredAt = new Date(event.occurred_at).getTime();
    return (
      occurredAt >= startMs &&
      occurredAt < endMs &&
      (input.artistId === undefined || event.artist_id === input.artistId) &&
      (input.dropId === undefined || event.drop_id === input.dropId) &&
      (input.experimentId === undefined ||
        event.experiment_id === input.experimentId) &&
      (input.variantId === undefined || event.variant_id === input.variantId)
    );
  });
  const byEventId = new Map<string, StoredLimitedDropEvent>();
  for (const event of scoped) {
    if (!byEventId.has(event.event_id)) byEventId.set(event.event_id, event);
  }
  const events = [...byEventId.values()];

  const normalViews = countUnique(
    events,
    event =>
      event.event_name === 'asset_page_viewed' && event.item_mode === 'normal'
  );
  const normalPurchases = countUnique(
    events,
    event =>
      event.event_name === 'drop_purchase_completed' &&
      event.item_mode === 'normal'
  );
  const activeViews = countUnique(
    events,
    event =>
      event.event_name === 'asset_page_viewed' &&
      event.item_mode === 'active_drop'
  );
  const activePurchases = countUnique(
    events,
    event =>
      event.event_name === 'drop_purchase_completed' &&
      event.item_mode === 'active_drop'
  );
  const terminalReached = countUnique(
    events,
    event => event.event_name === 'drop_terminal_reached'
  );
  const terminalSignups = countUnique(
    events,
    event =>
      event.event_name === 'completed_drop_signup' &&
      event.card_placement === 'terminal_page'
  );
  const completedCardExposures = countUnique(
    events,
    event => event.event_name === 'completed_drop_card_exposure'
  );
  const completedCardSignups = countUnique(
    events,
    event =>
      event.event_name === 'completed_drop_signup' &&
      event.card_placement === 'completed_drop_profile'
  );
  const profileCardImpressions = countUnique(
    events,
    event => event.event_name === 'profile_card_impression'
  );

  const metrics = {
    normal_item_purchase_rate: metricReceipt(
      'normal_item_purchase_rate',
      normalPurchases,
      normalViews
    ),
    active_drop_purchase_rate: metricReceipt(
      'active_drop_purchase_rate',
      activePurchases,
      activeViews
    ),
    terminal_page_signup_rate: metricReceipt(
      'terminal_page_signup_rate',
      terminalSignups,
      terminalReached
    ),
    completed_card_signup_rate: metricReceipt(
      'completed_card_signup_rate',
      completedCardSignups,
      completedCardExposures
    ),
    completed_drop_profile_signup_rate: metricReceipt(
      'completed_drop_profile_signup_rate',
      completedCardSignups,
      profileCardImpressions
    ),
  } satisfies Record<LimitedDropMetricKey, LimitedDropMetricReceipt>;

  const eventCounts = emptyEventCounts();
  for (const event of events) eventCounts[event.event_name] += 1;
  const ingestionLags = events.map(event =>
    Math.max(
      0,
      (new Date(event.ingested_at).getTime() -
        new Date(event.occurred_at).getTime()) /
        60_000
    )
  );
  const maxIngestionLag =
    ingestionLags.length > 0 ? Math.max(...ingestionLags) : null;
  const sourceAsOf =
    events.length > 0
      ? new Date(
          Math.max(
            ...events.map(event => new Date(event.ingested_at).getTime())
          )
        ).toISOString()
      : null;
  const invariantViolations = Object.values(metrics)
    .filter(metric => metric.numerator > metric.denominator)
    .map(metric => metric.metric);

  return {
    contract_version: LIMITED_DROP_FUNNEL_CONTRACT_VERSION,
    window: { start: input.start.toISOString(), end: input.end.toISOString() },
    observed_at: (input.observedAt ?? new Date()).toISOString(),
    filters: {
      ...(input.artistId ? { artist_id: input.artistId } : {}),
      ...(input.dropId ? { drop_id: input.dropId } : {}),
      ...(input.experimentId ? { experiment_id: input.experimentId } : {}),
      ...(input.variantId ? { variant_id: input.variantId } : {}),
    },
    source: 'server_analytics_events',
    freshness: {
      target_minutes: LIMITED_DROP_FRESHNESS_TARGET_MINUTES,
      status:
        maxIngestionLag === null
          ? 'unknown'
          : maxIngestionLag <= LIMITED_DROP_FRESHNESS_TARGET_MINUTES
            ? 'fresh'
            : 'stale',
      source_as_of: sourceAsOf,
      max_ingestion_lag_minutes:
        maxIngestionLag === null
          ? null
          : Math.round(maxIngestionLag * 100) / 100,
    },
    quality: {
      invalid_events_rejected: invalidEvents,
      duplicate_events_dropped: scoped.length - events.length,
      population_invariant_violations: invariantViolations,
    },
    event_counts: eventCounts,
    populations: {
      profile_card_impressions: profileCardImpressions,
      completed_card_exposures: completedCardExposures,
    },
    metrics,
  };
}

export const COMPLETED_CARD_EXPERIMENT_CONTRACT = {
  observation_days: 14,
  minimum_profile_impressions_per_arm: 200,
  confidence_level: 0.95,
  primary_metric: 'completed_drop_profile_signup_rate',
  guardrail_metrics: ['active_drop_purchase_rate', 'terminal_page_signup_rate'],
} as const;

export type CompletedCardDecision =
  | 'keep'
  | 'hide'
  | 'iterate'
  | 'inconclusive';

interface ConfidenceInterval {
  readonly low: number;
  readonly high: number;
}

export interface CompletedCardDecisionReceipt {
  readonly contract_version: 'completed-drop-card-decision/v1';
  readonly experiment_id: string;
  readonly recorded_at: string;
  readonly approved_window: { readonly start: string; readonly end: string };
  readonly minimum_exposure: {
    readonly unit: 'unique_profile_card_impressions_per_arm';
    readonly required: number;
    readonly control: number;
    readonly treatment: number;
  };
  readonly guardrails: ReadonlyArray<{
    readonly name: string;
    readonly status: 'pass' | 'fail' | 'unknown';
  }>;
  readonly decision: CompletedCardDecision;
  readonly reasons: readonly string[];
  readonly ship_now: string;
  readonly re_evaluate_when: string;
  readonly then: string;
}

export interface CompletedCardDecisionInput {
  readonly experimentId: string;
  readonly approvedWindow: { readonly start: Date; readonly end: Date };
  readonly recordedAt: Date;
  readonly control: LimitedDropReadModel;
  readonly treatment: LimitedDropReadModel;
  readonly privacyIncidents: number;
}

function wilsonInterval(metric: LimitedDropMetricReceipt): ConfidenceInterval {
  if (metric.denominator <= 0) return { low: 0, high: 1 };
  const zScore = 1.959963984540054;
  const denominator = metric.denominator;
  const proportion = metric.numerator / denominator;
  const zSquared = zScore ** 2;
  const center = proportion + zSquared / (2 * denominator);
  const margin =
    zScore *
    Math.sqrt(
      (proportion * (1 - proportion) + zSquared / (4 * denominator)) /
        denominator
    );
  const scale = 1 + zSquared / denominator;
  return {
    low: Math.max(0, (center - margin) / scale),
    high: Math.min(1, (center + margin) / scale),
  };
}

function compareGuardrail(
  name: LimitedDropMetricKey,
  control: LimitedDropMetricReceipt,
  treatment: LimitedDropMetricReceipt
): CompletedCardDecisionReceipt['guardrails'][number] {
  if (
    control.availability === 'unknown' ||
    treatment.availability === 'unknown'
  ) {
    return { name, status: 'unknown' };
  }
  const controlInterval = wilsonInterval(control);
  const treatmentInterval = wilsonInterval(treatment);
  return {
    name,
    status: treatmentInterval.high < controlInterval.low ? 'fail' : 'pass',
  };
}

function decisionActions(
  decision: CompletedCardDecision
): Pick<
  CompletedCardDecisionReceipt,
  'ship_now' | 're_evaluate_when' | 'then'
> {
  switch (decision) {
    case 'keep':
      return {
        ship_now: 'keep the completed-drop profile card visible',
        re_evaluate_when: 'a guardrail regresses or a new approved test ends',
        then: 'retain, hide, or iterate from the new receipt',
      };
    case 'hide':
      return {
        ship_now: 'hide the completed-drop profile card',
        re_evaluate_when: 'a revised treatment completes an approved window',
        then: 'restore only with a keep receipt',
      };
    case 'iterate':
      return {
        ship_now: 'keep the current treatment experiment-only',
        re_evaluate_when:
          'a revised treatment completes another approved window',
        then: 'choose keep or hide from the next receipt',
      };
    case 'inconclusive':
      return {
        ship_now: 'make no visibility change',
        re_evaluate_when: 'the listed evidence gaps are resolved',
        then: 'record a new decision receipt',
      };
  }
}

export function buildCompletedCardDecisionReceipt(
  input: CompletedCardDecisionInput
): CompletedCardDecisionReceipt {
  const reasons: string[] = [];
  const windowMs =
    input.approvedWindow.end.getTime() - input.approvedWindow.start.getTime();
  const requiredWindowMs =
    COMPLETED_CARD_EXPERIMENT_CONTRACT.observation_days * 24 * 60 * 60 * 1000;
  const controlExposure = input.control.populations.profile_card_impressions;
  const treatmentExposure =
    input.treatment.populations.profile_card_impressions;
  const guardrails: CompletedCardDecisionReceipt['guardrails'] = [
    {
      name: 'privacy_incidents',
      status: input.privacyIncidents > 0 ? 'fail' : 'pass',
    },
    {
      name: 'ledger_freshness',
      status:
        input.control.freshness.status === 'fresh' &&
        input.treatment.freshness.status === 'fresh'
          ? 'pass'
          : 'unknown',
    },
    {
      name: 'population_invariants',
      status:
        input.control.quality.population_invariant_violations.length === 0 &&
        input.treatment.quality.population_invariant_violations.length === 0
          ? 'pass'
          : 'fail',
    },
    compareGuardrail(
      'active_drop_purchase_rate',
      input.control.metrics.active_drop_purchase_rate,
      input.treatment.metrics.active_drop_purchase_rate
    ),
    compareGuardrail(
      'terminal_page_signup_rate',
      input.control.metrics.terminal_page_signup_rate,
      input.treatment.metrics.terminal_page_signup_rate
    ),
  ];

  let decision: CompletedCardDecision = 'inconclusive';
  if (input.privacyIncidents > 0) {
    decision = 'hide';
    reasons.push('privacy_guardrail_failed');
  } else if (windowMs < requiredWindowMs) {
    reasons.push('approved_window_shorter_than_14_days');
  } else if (input.recordedAt.getTime() < input.approvedWindow.end.getTime()) {
    reasons.push('approved_window_still_open');
  } else if (
    controlExposure <
      COMPLETED_CARD_EXPERIMENT_CONTRACT.minimum_profile_impressions_per_arm ||
    treatmentExposure <
      COMPLETED_CARD_EXPERIMENT_CONTRACT.minimum_profile_impressions_per_arm
  ) {
    reasons.push('minimum_exposure_not_reached');
  } else if (guardrails.some(guardrail => guardrail.status === 'unknown')) {
    reasons.push('guardrail_data_unknown');
  } else if (guardrails.some(guardrail => guardrail.status === 'fail')) {
    decision = 'hide';
    reasons.push('guardrail_failed');
  } else {
    const controlPrimary =
      input.control.metrics.completed_drop_profile_signup_rate;
    const treatmentPrimary =
      input.treatment.metrics.completed_drop_profile_signup_rate;
    if (
      controlPrimary.availability === 'unknown' ||
      treatmentPrimary.availability === 'unknown'
    ) {
      reasons.push('primary_metric_unknown');
    } else {
      const controlInterval = wilsonInterval(controlPrimary);
      const treatmentInterval = wilsonInterval(treatmentPrimary);
      if (treatmentInterval.low > controlInterval.high) {
        decision = 'keep';
        reasons.push('primary_metric_improved_at_95_percent_confidence');
      } else if (treatmentInterval.high < controlInterval.low) {
        decision = 'hide';
        reasons.push('primary_metric_regressed_at_95_percent_confidence');
      } else {
        decision = 'iterate';
        reasons.push('mature_result_has_overlapping_confidence_intervals');
      }
    }
  }

  return {
    contract_version: 'completed-drop-card-decision/v1',
    experiment_id: input.experimentId,
    recorded_at: input.recordedAt.toISOString(),
    approved_window: {
      start: input.approvedWindow.start.toISOString(),
      end: input.approvedWindow.end.toISOString(),
    },
    minimum_exposure: {
      unit: 'unique_profile_card_impressions_per_arm',
      required:
        COMPLETED_CARD_EXPERIMENT_CONTRACT.minimum_profile_impressions_per_arm,
      control: controlExposure,
      treatment: treatmentExposure,
    },
    guardrails,
    decision,
    reasons,
    ...decisionActions(decision),
  };
}
