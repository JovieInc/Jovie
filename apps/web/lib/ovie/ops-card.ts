/**
 * summer.ops-card.v1 — shared operational data rendered as an editorial card
 * in the founder OV chat (JOV-6708).
 *
 * Summer tool receipts may carry a structured `card` payload. The payload is
 * the only source of truth for what the card displays: every fact value and
 * series point shown in chat is emitted here, and `renderOpsCardText`
 * produces the exact flat-text form handed to Jev copy/factuality evals.
 * Missing measurements render as "Not measured" — never zero, never now,
 * never invented.
 */

import { z } from 'zod';
import type {
  CountMeasurement,
  DurationMeasurement,
  ShippingStateProjection,
} from '@/lib/ovie/shipping-state';

export const SUMMER_OPS_CARD_SCHEMA = 'summer.ops-card.v1' as const;

export const SUMMER_OPS_CARD_KINDS = [
  'shipping',
  'merge-queue',
  'revenue',
  'ai-spend',
  'cohort',
  'generic',
] as const;

export type SummerOpsCardKind = (typeof SUMMER_OPS_CARD_KINDS)[number];

export const SUMMER_OPS_CARD_STATES = [
  'fresh',
  'stale',
  'degraded',
  'disconnected',
  'unavailable',
  'unauthorized',
  'unknown',
] as const;

export type SummerOpsCardState = (typeof SUMMER_OPS_CARD_STATES)[number];

export const NOT_MEASURED_LABEL = 'Not measured' as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const summerOpsCardSchema = z
  .object({
    schema: z.literal(SUMMER_OPS_CARD_SCHEMA),
    kind: z.enum(SUMMER_OPS_CARD_KINDS),
    title: text(120),
    summary: text(400).optional(),
    state: z.enum(SUMMER_OPS_CARD_STATES),
    observedAt: z.iso.datetime({ offset: true }).nullable(),
    source: text(160).optional(),
    facts: z
      .array(
        z
          .object({
            label: text(80),
            value: text(160),
            detail: text(200).optional(),
          })
          .strict()
      )
      .max(24)
      .default([]),
    series: z
      .object({
        label: text(80),
        unit: text(24).optional(),
        points: z
          .array(
            z
              .object({
                label: text(80),
                value: z.number().finite().nonnegative(),
              })
              .strict()
          )
          .min(1)
          .max(48),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();

export type SummerOpsCard = z.infer<typeof summerOpsCardSchema>;
export type SummerOpsCardFact = SummerOpsCard['facts'][number];

export function isSummerOpsCard(value: unknown): value is SummerOpsCard {
  return summerOpsCardSchema.safeParse(value).success;
}

/**
 * Extract a card from a tool output envelope. Tool outputs carry the payload
 * under `card`; anything that fails schema validation is ignored so malformed
 * data degrades to the standard status row, never a half-rendered card.
 */
export function opsCardFromToolOutput(
  output: Record<string, unknown> | undefined
): SummerOpsCard | null {
  if (!output || typeof output !== 'object') return null;
  const parsed = summerOpsCardSchema.safeParse(output.card);
  return parsed.success ? parsed.data : null;
}

function countText(measurement: CountMeasurement): string {
  return measurement.value === null
    ? NOT_MEASURED_LABEL
    : String(measurement.value);
}

function durationText(measurement: DurationMeasurement): string {
  if (measurement.value === null) return NOT_MEASURED_LABEL;
  const seconds = measurement.value;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function meaningText(measurement: {
  readonly state: string;
  readonly value: boolean | null;
}): string {
  if (measurement.value === null) return NOT_MEASURED_LABEL;
  return measurement.value ? 'Yes' : 'No';
}

function sourceObservation(
  projection: ShippingStateProjection,
  sourceId: keyof ShippingStateProjection['sources']
) {
  return projection.sources[sourceId];
}

/**
 * Build the shipping-lanes card from the last authoritative shipping-state
 * projection. Only measured values become numbers; unmeasured counts become
 * the explicit "Not measured" label so the rendered card can never show
 * invented figures.
 */
export function buildShippingOpsCard(
  projection: ShippingStateProjection
): SummerOpsCard {
  const mergeQueue = sourceObservation(projection, 'github-native-merge-queue');
  const runtime = sourceObservation(projection, 'summer-runtime');
  const ci = sourceObservation(projection, 'exact-sha-ci');

  const state: SummerOpsCardState = (
    SUMMER_OPS_CARD_STATES as readonly string[]
  ).includes(projection.state)
    ? (projection.state as SummerOpsCardState)
    : 'unknown';

  const facts: SummerOpsCardFact[] = [
    {
      label: 'Merge queue',
      value: countText(mergeQueue.counts.queued),
    },
    {
      label: 'Open pull requests',
      value: countText(mergeQueue.counts.openPullRequests),
    },
    {
      label: 'Running tasks',
      value: countText(runtime.counts.running),
    },
    {
      label: 'Retrying',
      value: countText(projection.retrying),
    },
    {
      label: 'Blocked',
      value: countText(runtime.counts.blocked),
    },
    {
      label: 'Terminal failures',
      value: countText(projection.terminalFailures),
    },
    {
      label: 'Capacity available',
      value: countText(projection.capacityAvailable),
    },
    {
      label: 'CI green',
      value: meaningText(projection.meanings.ciGreen),
    },
    {
      label: 'Production verified',
      value: meaningText(projection.meanings.productionVerified),
    },
    {
      label: 'Exact live build',
      value: meaningText(projection.meanings.exactLiveBuild),
    },
    {
      label: 'Time to ship',
      value: durationText(projection.timeToShipSeconds),
    },
  ];

  const measuredPoints = [
    { label: 'Queued', measurement: mergeQueue.counts.queued },
    { label: 'Open PRs', measurement: mergeQueue.counts.openPullRequests },
    { label: 'Running', measurement: runtime.counts.running },
    { label: 'Retrying', measurement: projection.retrying },
    { label: 'Blocked', measurement: runtime.counts.blocked },
    { label: 'CI runs', measurement: ci.counts.running },
  ].flatMap(entry =>
    entry.measurement.value === null
      ? []
      : [{ label: entry.label, value: entry.measurement.value }]
  );

  return {
    schema: SUMMER_OPS_CARD_SCHEMA,
    kind: 'shipping',
    title: 'Shipping lanes',
    state,
    observedAt: projection.observationTimestamp ?? null,
    source: projection.producerId ?? 'ubuntu-operational-truth',
    facts,
    series:
      measuredPoints.length > 0
        ? { label: 'Live counts', points: measuredPoints }
        : null,
  };
}

/**
 * Flat text of exactly what the card displays. This is the artifact Jev
 * copy/factuality checks are run against — keeping it derived from the same
 * payload guarantees the evaluated text matches the rendered card.
 */
export function renderOpsCardText(card: SummerOpsCard): string {
  const lines = [`${card.title} (${card.kind}, ${card.state})`];
  if (card.summary) lines.push(card.summary);
  for (const fact of card.facts) {
    lines.push(`${fact.label}: ${fact.value}`);
  }
  if (card.series) {
    const points = card.series.points
      .map(point => `${point.label} ${point.value}`)
      .join(', ');
    lines.push(`${card.series.label}: ${points}`);
  }
  if (card.observedAt) lines.push(`Observed at ${card.observedAt}`);
  return lines.join('\n');
}
