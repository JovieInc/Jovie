import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{1,63}$/u);
const timestamp = z.string().datetime({ offset: true });
const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const count = z.number().int().nonnegative().safe();
const measurement = z
  .object({
    cohortId: id,
    sampleStatus: z.enum(['complete', 'sparse']),
    attemptedJourneys: count,
    successfulJourneys: count,
    failedJourneys: count,
    abandonedJourneys: count,
    paidConversions: z
      .object({
        cohortId: id,
        basis: z.literal('collected-positive-payment'),
        count,
      })
      .strict()
      .nullable(),
  })
  .strict();

// Independently owned wire validator for jovie.eve.summer-product-paths/v1.
// Summer owns policy/ranking; keep compatibility with the versioned fixtures.
/** Product-owned aggregate evidence only. It conveys no execution authority. */
export const summerProductPathsSchema = z
  .object({
    schema: z.literal('jovie.eve.summer-product-paths/v1'),
    observedAt: timestamp,
    sourceRevision: sha,
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    reference: z.string().url().max(2048),
    cohort: z
      .object({
        id,
        definitionRevision: sha,
        windowStart: timestamp,
        windowEnd: timestamp,
        environment: z.enum(['production', 'staging', 'local']),
        deploymentRevision: sha,
      })
      .strict(),
    paths: z
      .array(
        z
          .object({
            id,
            interface: z.enum([
              'web',
              'cli',
              'mcp',
              'desktop',
              'mobile',
              'api',
            ]),
            stage: z.enum([
              'account-created',
              'first-value',
              'paid-plan-started',
              'payment-fulfilled',
              'retained-use',
            ]),
            owner: id,
            handle: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:#/_-]{1,127}$/u),
            blockedSince: timestamp.nullable(),
            basis: z.enum(['measured', 'critical-path-risk', 'hypothesis']),
            measurement: measurement.nullable(),
          })
          .strict()
      )
      .min(1)
      .max(16),
  })
  .strict()
  .superRefine((projection, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    const start = Date.parse(projection.cohort.windowStart);
    const end = Date.parse(projection.cohort.windowEnd);
    if (
      start >= end ||
      end > Date.parse(projection.observedAt) ||
      end - start > 31 * 86400000
    )
      fail('cohort window must precede observation and span at most 31 days');
    if (
      new Set(projection.paths.map(path => path.id)).size !==
      projection.paths.length
    )
      fail('product path ids must be unique');
    for (const path of projection.paths) {
      if (
        path.blockedSince &&
        Date.parse(path.blockedSince) > Date.parse(projection.observedAt)
      )
        fail('blocked time cannot follow observation');
      const metrics = path.measurement;
      if (path.basis === 'measured' && !metrics)
        fail('measured paths require counts');
      if (!metrics) continue;
      if (
        metrics.cohortId !== projection.cohort.id ||
        (metrics.paidConversions &&
          metrics.paidConversions.cohortId !== metrics.cohortId)
      )
        fail('all journey and payment counts must bind to the same cohort');
      if (
        metrics.successfulJourneys +
          metrics.failedJourneys +
          metrics.abandonedJourneys >
        metrics.attemptedJourneys
      )
        fail(
          'mutually exclusive terminal outcomes cannot exceed attempted journeys'
        );
      if (
        metrics.paidConversions &&
        metrics.paidConversions.count > metrics.successfulJourneys
      )
        fail(
          'collected payment conversions must be a subset of successful cohort journeys'
        );
      if (
        metrics.sampleStatus === 'complete' &&
        metrics.attemptedJourneys === 0
      )
        fail('an empty sample cannot establish complete conversion evidence');
    }
  });
