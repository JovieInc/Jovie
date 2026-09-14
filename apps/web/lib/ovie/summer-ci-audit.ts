import { z } from 'zod';

/** Observation-only v2: accepting measurements never accepts an execution class. */
export function createSummerCiAuditV2Schema<T extends string>(
  ids: readonly [T, ...T[]]
) {
  const timestamp = z.string().datetime({ offset: true });
  const sha = z
    .string()
    .regex(/^[a-f0-9]{40}$/u)
    .refine(value => value !== '0'.repeat(40));
  const reason = z.enum(['head-drift', 'incomplete-observation']);
  return z
    .object({
      schema: z.literal('jovie-ci-bottleneck-audit/v2'),
      observedAt: timestamp,
      sourceRevision: sha,
      sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
      classes: z.array(z.never()).length(0),
      excludedClasses: z
        .array(
          z
            .object({
              id: z.enum(ids),
              reason: z.literal('mapping-unaccepted'),
            })
            .strict()
        )
        .length(ids.length),
      measurements: z
        .array(
          z
            .object({
              repository: z.literal('JovieInc/Jovie'),
              pr: z.number().int().positive().safe().nullable(),
              headSha: sha,
              checkId: z.number().int().positive().safe(),
              checkName: z
                .string()
                .min(1)
                .max(160)
                .refine(value => !/[\u0000-\u001f]/u.test(value)),
              conclusion: z.enum([
                'failure',
                'timed_out',
                'action_required',
                'startup_failure',
                'cancelled',
              ]),
              completedAt: timestamp,
              dispatchable: z.literal(false),
              nonDispatchableReasons: z.tuple([
                z.literal('class-unmapped'),
                z.literal('owner-unaccepted'),
                z.literal('impact-rule-unaccepted'),
                z.literal('action-unaccepted'),
              ]),
            })
            .strict()
        )
        .max(25),
      sample: z
        .object({
          checkRunsObserved: z.number().int().nonnegative().safe(),
          failuresObserved: z.number().int().nonnegative().safe(),
          failuresOmitted: z.number().int().nonnegative().safe(),
          targetsOmitted: z.number().int().nonnegative().safe(),
          complete: z.boolean(),
          reasons: z.array(reason).max(2),
        })
        .strict(),
    })
    .strict()
    .superRefine((value, context) => {
      const sortedIds = [...ids].sort();
      if (
        value.excludedClasses.some((row, index) => row.id !== sortedIds[index])
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Every unmapped class must remain excluded exactly once',
        });
      }
      const identities = value.measurements.map(
        row => `${row.pr}:${row.headSha}:${row.checkId}`
      );
      const { sample } = value;
      if (
        new Set(identities).size !== identities.length ||
        value.measurements.some(
          row => Date.parse(row.completedAt) > Date.parse(value.observedAt)
        ) ||
        sample.failuresObserved !==
          value.measurements.length + sample.failuresOmitted ||
        sample.checkRunsObserved < sample.failuresObserved ||
        sample.reasons.join(',') !==
          [...new Set(sample.reasons)].sort().join(',') ||
        sample.complete !==
          (sample.reasons.length === 0 && sample.targetsOmitted === 0)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'CI audit sample is inconsistent or cross-bound',
        });
      }
    });
}
