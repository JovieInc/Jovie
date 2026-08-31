import { z } from 'zod';
import {
  OBSERVATION_STATES,
  SHIPPING_SOURCE_IDS,
  SHIPPING_STATE_SCHEMA,
} from './contract';

const countMeasurementSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not-measured'), value: z.null() }),
  z.object({ state: z.literal('measured-zero'), value: z.literal(0) }),
  z.object({
    state: z.literal('measured-nonzero'),
    value: z.number().finite().positive(),
  }),
]);

const booleanMeasurementSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not-measured'), value: z.null() }),
  z.object({ state: z.literal('measured'), value: z.boolean() }),
]);

const durationMeasurementSchema = countMeasurementSchema;
const NOT_MEASURED_COUNT_VALUE = {
  state: 'not-measured',
  value: null,
} as const;
const NOT_MEASURED_DURATIONS = {
  queueWaitMs: NOT_MEASURED_COUNT_VALUE,
  runDurationMs: NOT_MEASURED_COUNT_VALUE,
} as const;
const observationStateSchema = z.enum(OBSERVATION_STATES);
const sourceIdSchema = z.enum(SHIPPING_SOURCE_IDS);

const sourceObservationSchema = z.object({
  sourceId: sourceIdSchema,
  state: observationStateSchema,
  sourceTimestamp: z.string().nullable(),
  observationTimestamp: z.string(),
  freshnessDeadline: z.string(),
  sourceRevision: z.string().max(128).nullable(),
  lastError: z
    .object({
      at: z.string(),
      code: z.string().max(64),
      message: z.string().max(240),
    })
    .nullable(),
  correlation: z.object({
    workId: z.string().max(128).nullable(),
    leaseId: z.string().max(128).nullable(),
    prNumber: z.number().int().positive().nullable(),
    ciRunId: z.string().max(128).nullable(),
    deploymentId: z.string().max(128).nullable(),
    buildId: z.string().max(128).nullable(),
    sha: z
      .string()
      .regex(/^[0-9a-f]{40}$/i)
      .nullable(),
  }),
  counts: z.object({
    running: countMeasurementSchema,
    retrying: countMeasurementSchema,
    blocked: countMeasurementSchema,
    queued: countMeasurementSchema,
    openPullRequests: countMeasurementSchema
      .optional()
      .default(NOT_MEASURED_COUNT_VALUE),
    capacityAvailable: countMeasurementSchema,
  }),
  durations: z
    .object({
      queueWaitMs: durationMeasurementSchema,
      runDurationMs: durationMeasurementSchema,
    })
    .optional()
    .default(NOT_MEASURED_DURATIONS),
});

const sourceMapShape = Object.fromEntries(
  SHIPPING_SOURCE_IDS.map(sourceId => [sourceId, sourceObservationSchema])
) as Record<
  (typeof SHIPPING_SOURCE_IDS)[number],
  typeof sourceObservationSchema
>;

export const shippingCockpitProjectionSchema = z.object({
  schema: z.literal(SHIPPING_STATE_SCHEMA),
  state: observationStateSchema,
  observationTimestamp: z.string(),
  freshnessDeadline: z.string(),
  latencyMs: z.number().finite().nonnegative(),
  meanings: z.object({
    ciGreen: booleanMeasurementSchema,
    productionVerified: booleanMeasurementSchema,
    exactLiveBuild: booleanMeasurementSchema,
  }),
  retrying: countMeasurementSchema,
  terminalFailures: countMeasurementSchema,
  capacityAvailable: countMeasurementSchema,
  sources: z.object(sourceMapShape),
});

export type ShippingCockpitProjection = z.infer<
  typeof shippingCockpitProjectionSchema
>;

export function parseShippingCockpitProjection(
  value: unknown
): ShippingCockpitProjection | null {
  const parsed = shippingCockpitProjectionSchema.safeParse(value);
  if (!parsed.success) return null;
  for (const sourceId of SHIPPING_SOURCE_IDS) {
    if (parsed.data.sources[sourceId].sourceId !== sourceId) return null;
  }
  return parsed.data;
}
