import { z } from 'zod';

const ref = z.string().trim().min(1).max(1000);
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/u);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().finite().nonnegative();

/** Missing metrics remain unknown. Explicit measured zero is evidence. */
export const demandMetricsSchema = z
  .object({
    activationCount: count.optional(),
    claimCount: count.optional(),
    costCents: count.optional(),
    graphExpansionCount: count.optional(),
    maintenanceMinutes: count.optional(),
    qualityScore: count.max(1).optional(),
    repeatUsageCount: count.optional(),
    retentionCount: count.optional(),
    revenueCents: count.optional(),
    usageCount: count.optional(),
  })
  .strict();
export type DemandMetrics = z.infer<typeof demandMetricsSchema>;

const observation = z
  .object({
    observedAt: timestamp,
    surface: z.enum([
      'agent-api',
      'agent-feedback',
      'ask-jovie',
      'chat',
      'cli',
      'mcp',
      'web',
    ]),
    request: ref,
    capability: ref,
    job: ref,
    entity: z
      .object({
        kind: z.enum([
          'artist',
          'fan',
          'label',
          'other',
          'release',
          'song',
          'venue',
        ]),
        name: ref,
        graphId: ref.optional(),
      })
      .strict()
      .optional(),
    provenance: z
      .object({
        kind: z.enum([
          'external-customer',
          'external-organic',
          'founder',
          'internal-fleet',
          'internal-synthetic',
          'unknown',
        ]),
        sourceKey: ref,
        requestId: ref.optional(),
      })
      .strict(),
    supported: z.boolean().optional(),
    icpAdjacent: z.boolean().optional(),
    requiresHumanGate: z.boolean().optional(),
  })
  .strict();
const unit = z.number().min(0).max(1);
const kind = z.enum([
  'acquisition',
  'certification',
  'implementation',
  'outbound',
  'repair',
  'research',
  'spend',
  'unblocking',
]);

/** Authority is supplied by authenticated Summer, never by a public demand signal. */
export const demandAllocationPlanSchema = z
  .object({
    id,
    kind,
    observations: z.array(observation).min(1).max(100),
    context: z
      .object({
        assetCompounding: unit.optional(),
        fragmentationRisk: unit.optional(),
        graphLeverage: unit.optional(),
        implementationCost: unit.optional(),
        jobImportance: unit.optional(),
        ongoingCost: unit.optional(),
        primitiveReuse: unit.optional(),
        revenueProximity: unit.optional(),
      })
      .strict(),
    authorization: z
      .object({
        ref,
        validUntil: timestamp,
        effortMinutes: z.number().int().min(1).max(480),
        lowRisk: z.boolean(),
      })
      .strict(),
    /** Measured signal justifying one bounded test outside the musician ICP. */
    icpTestEvidence: z
      .object({
        ref,
        independentCustomers: z.number().int().positive(),
        observedAt: timestamp,
      })
      .strict()
      .optional(),
    prediction: z
      .object({
        metrics: demandMetricsSchema.refine(
          value => Object.keys(value).length > 0,
          'prediction-needs-metrics'
        ),
        reviewAfterHours: z.number().int().min(1).max(2160),
        sourceRef: ref,
      })
      .strict(),
  })
  .strict();
export type DemandAllocationPlan = z.infer<typeof demandAllocationPlanSchema>;

export const demandAllocationCommandSchema = z.discriminatedUnion('op', [
  z
    .object({ op: z.literal('submit'), plan: demandAllocationPlanSchema })
    .strict(),
  z.object({ op: z.literal('reconcile') }).strict(),
  z.object({ op: z.literal('claim'), id, worker: id }).strict(),
  z
    .object({ op: z.literal('complete'), id, worker: id, executionRef: ref })
    .strict(),
  z
    .object({
      op: z.literal('review'),
      id,
      receiptId: id,
      supersedes: id.nullable(),
      windowStartedAt: timestamp,
      windowEndedAt: timestamp,
      metrics: demandMetricsSchema,
      evidenceRefs: z.array(ref).min(1).max(20),
    })
    .strict(),
]);
export type DemandAllocationCommand = z.infer<
  typeof demandAllocationCommandSchema
>;
