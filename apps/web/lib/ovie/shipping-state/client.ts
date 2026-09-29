import { z } from 'zod';
import {
  DELIVERY_MERGE_REPOS,
  type DeliverySummary,
  emptyDeliverySummary,
  OBSERVATION_STATES,
  OPERATIONAL_TASK_SYNC_STATES,
  OPERATIONAL_TASK_WORKFLOW_STATES,
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
const operationalTaskWorkflowStateSchema = z.enum(
  OPERATIONAL_TASK_WORKFLOW_STATES
);
const operationalTaskSyncStateSchema = z.enum(OPERATIONAL_TASK_SYNC_STATES);
const operationalTaskIdSchema = z.string().regex(/^linear:[A-Z]+-\d+$/);

const operationalTaskSchema = z.object({
  id: operationalTaskIdSchema,
  linearIdentifier: z.string().regex(/^[A-Z]+-\d+$/),
  linearUrl: z.string().url().startsWith('https://linear.app/').nullable(),
  title: z.string().min(1).max(180),
  workflowState: operationalTaskWorkflowStateSchema,
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
  attempt: z.number().int().nonnegative().nullable(),
  retryAt: z.string().nullable(),
  sourceRevision: z.string().max(128).nullable(),
  updatedAt: z.string().nullable(),
  pullRequest: z
    .object({
      number: z.number().int().positive(),
      url: z.string().url().startsWith('https://').nullable(),
      branch: z.string().max(160).nullable(),
      agent: z.enum(['devin', 'codex']).nullable(),
      isDraft: z.boolean(),
      checks: z.object({
        rollup: z.enum(['success', 'failure', 'pending', 'unknown']),
        failing: z.array(z.string().max(120)).max(20),
      }),
      queuePosition: z.number().int().positive().nullable(),
      queueState: z.string().max(32).nullable(),
      createdAt: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

const operationalTaskFeedSchema = z.object({
  canonicalSource: z.literal('linear'),
  cacheMode: z.literal('local-reconciled'),
  syncState: operationalTaskSyncStateSchema,
  sourceId: z.literal('lane-pull-requests'),
  observedAt: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  freshnessDeadline: z.string().nullable(),
  tasks: z.array(operationalTaskSchema),
  deltas: z.array(
    z.object({
      taskId: operationalTaskIdSchema,
      kind: z.enum(['added', 'updated', 'removed']),
      fromState: operationalTaskWorkflowStateSchema.nullable(),
      toState: operationalTaskWorkflowStateSchema.nullable(),
      sequence: z.number().int().nonnegative(),
    })
  ),
});

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
    terminalFailures: countMeasurementSchema
      .optional()
      .default(NOT_MEASURED_COUNT_VALUE),
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

const deliveryLanesSchema = z.object({
  running: countMeasurementSchema,
  slots: countMeasurementSchema,
  idle: countMeasurementSchema,
  pool: countMeasurementSchema,
  lastLandingAgeSeconds: countMeasurementSchema,
  diskFreePct: z.number().finite().nullable(),
  lanes: z.array(
    z.object({
      name: z.string().min(1).max(64),
      running: z.number().int().nonnegative(),
      slots: z.number().int().nonnegative(),
    })
  ),
  alerts: z.array(z.string().max(160)),
  heldByReason: z.record(z.string(), z.number().int().nonnegative()),
  failedByReason: z.record(z.string(), z.number().int().nonnegative()),
  publishedAt: z.string().nullable(),
  stale: z.boolean(),
});

const deliveryMergesSchema = z.object({
  since: z.string().nullable(),
  today: countMeasurementSchema,
  byRepo: z.object(
    Object.fromEntries(
      DELIVERY_MERGE_REPOS.map(repo => [repo, countMeasurementSchema])
    ) as Record<
      (typeof DELIVERY_MERGE_REPOS)[number],
      typeof countMeasurementSchema
    >
  ),
  last7Days: countMeasurementSchema,
  prior7Days: countMeasurementSchema,
});

const deliveryProductionSchema = z.object({
  sha: z
    .string()
    .regex(/^[0-9a-f]{40}$/i)
    .nullable(),
  version: z.string().max(32).nullable(),
  deployedAt: z.string().nullable(),
  behindMain: countMeasurementSchema,
});

const deliverySummerSchema = z.object({
  availability: z.enum(['up', 'down', 'degraded']).nullable(),
});

/**
 * Parse the delivery summary one block at a time. A malformed block reads as
 * not-measured; it never discards the blocks that did parse.
 */
export function parseDeliverySummary(value: unknown): DeliverySummary {
  const empty = emptyDeliverySummary();
  const record =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const block = <T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : fallback;
  };
  return {
    lanes: block(deliveryLanesSchema, record.lanes, empty.lanes),
    merges: block(deliveryMergesSchema, record.merges, empty.merges),
    mergeQueueDepth: block(
      countMeasurementSchema,
      record.mergeQueueDepth,
      empty.mergeQueueDepth
    ),
    inFlight: block(countMeasurementSchema, record.inFlight, empty.inFlight),
    production: block(
      deliveryProductionSchema,
      record.production,
      empty.production
    ),
    summer: block(deliverySummerSchema, record.summer, empty.summer),
  };
}

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
  operationalTasks: operationalTaskFeedSchema,
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
