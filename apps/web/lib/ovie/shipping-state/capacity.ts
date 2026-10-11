import { z } from 'zod';

const nullableNonnegative = z.number().finite().nonnegative().nullable();
const boundedText = z.string().min(1).max(200);
const outcomeSchema = z.object({
  useful: z.number().int().nonnegative(),
  certified: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  retry: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});
const routeSchema = z.object({
  schema: z.literal('jovie.capacity-route-receipt/v1'),
  selectedJob: z.string().regex(/^JOV-\d+$/),
  selectedRoute: z.string().min(1).max(64),
  selectedLeaseId: z.string().min(1).max(80),
  alternativesConsidered: z.array(z.string().min(1).max(64)).max(20),
  marginalValue: nullableNonnegative,
  expectedCertifiedOutcome: boundedText.nullable(),
  drainMode: z.enum(['normal', 'fast', 'emergency']),
  modeTrigger: boundedText,
  reason: boundedText,
  replanConditions: z.array(boundedText).max(20),
  sourceGaps: z.array(boundedText).max(20),
});

export const capacityHorizonSchema = z.object({
  schema: z.literal('jovie.capacity-horizon/v1'),
  generatedAt: z.string().datetime({ offset: true }),
  leases: z.array(
    z.object({
      leaseId: z.string().regex(/^codex:[A-Za-z0-9_-]{1,32}$/),
      alias: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
      provider: z.string().min(1).max(32),
      sourcePresent: z.boolean(),
      available: z.boolean(),
      subscriptionStatus: z.enum([
        'active',
        'payment-grace',
        'ending',
        'inactive',
        'unknown',
      ]),
      compatibility: z.object({
        cli: boundedText.nullable(),
        harness: boundedText.nullable(),
        models: z.array(boundedText).max(20),
        restrictions: z.array(boundedText).max(20),
      }),
      concurrency: nullableNonnegative,
      usableRemaining: nullableNonnegative,
      bankedCount: z.number().int().nonnegative().nullable(),
      event: z.object({
        kind: z.enum([
          'natural-reset',
          'banked-expiry',
          'promo-expiry',
          'access-loss',
          'unknown',
        ]),
        label: boundedText,
        at: z.string().datetime({ offset: true }).nullable(),
        countdownSeconds: nullableNonnegative,
      }),
      forecast: z.object({
        schema: z.literal('jovie.drain-forecast/v1'),
        completionP50At: z.string().datetime({ offset: true }).nullable(),
        completionP90At: z.string().datetime({ offset: true }).nullable(),
        sustainablePercentPerHour: nullableNonnegative,
        burstPercentPerHour: nullableNonnegative,
        usableBeforeUnavailability: nullableNonnegative,
        projectedUnused: nullableNonnegative,
        qualifiedWork: z.array(z.string().regex(/^JOV-\d+$/)).max(20),
        bottleneck: boundedText.nullable(),
      }),
      route: routeSchema.nullable(),
      mode: z.enum(['normal', 'fast', 'emergency', 'unknown']),
      outcomes: outcomeSchema,
      freshness: z.object({
        observedAt: z.string().datetime({ offset: true }).nullable(),
        status: z.enum(['fresh', 'stale', 'contradictory', 'unknown']),
        confidence: z.string().min(1).max(32),
      }),
    })
  ),
  outcomes: outcomeSchema,
  incidents: z.array(
    z.object({
      schema: z.literal('jovie.capacity-expiry-incident/v1'),
      incidentId: z.string().min(1).max(180),
      leaseId: z.string().min(1).max(80),
      kind: z.string().min(1).max(64),
      unusedAmount: nullableNonnegative,
      hardConstraint: boundedText,
      staleOrMissingInput: z.boolean(),
      idleIntervalSeconds: z.number().int().nonnegative(),
      rootCause: boundedText,
      remediationOwner: z.string().min(1).max(64),
      jobEvidence: z.array(z.string().regex(/^JOV-\d+$/)).max(20),
    })
  ),
  topBlocker: boundedText.nullable(),
  founderJudgmentRequired: z.boolean(),
  controls: z.literal('show-only'),
});

export type CapacityHorizon = z.infer<typeof capacityHorizonSchema>;
export type CapacityHorizonLease = CapacityHorizon['leases'][number];
export type CapacityDrainMode = CapacityHorizonLease['mode'];
