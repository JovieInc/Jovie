import { z } from 'zod';

/** One accepted class mapping. Measurements stay non-dispatchable. */
const ACCEPTED_CLASS_ID = 'affected-only-unit-selection';

export function createSummerCiAuditV2Schema<T extends string>(
  ids: readonly [T, ...T[]]
) {
  const timestamp = z.string().datetime({ offset: true });
  const sha = z
    .string()
    .regex(/^[a-f0-9]{40}$/u)
    .refine(value => value !== '0'.repeat(40));
  const reason = z.enum(['head-drift', 'incomplete-observation']);
  const acceptedClass = z
    .object({
      id: z.literal(ACCEPTED_CLASS_ID),
      state: z.enum(['open', 'partial']),
      owner: z.literal('ci-risk-classifier'),
      'impact-rule': z.literal('affected-unit-paths-only'),
      action: z.literal('remediate-selected-ci-audit-class'),
      handle: z.literal('audit:affected-only-units'),
    })
    .strict();
  return z
    .object({
      schema: z.literal('jovie-ci-bottleneck-audit/v2'),
      observedAt: timestamp,
      sourceRevision: sha,
      sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
      classes: z.array(acceptedClass).length(1),
      excludedClasses: z
        .array(
          z
            .object({
              id: z.enum(ids),
              reason: z.literal('mapping-unaccepted'),
            })
            .strict()
        )
        .length(ids.length - 1),
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
      const excludedIds = [...ids]
        .filter(id => id !== ACCEPTED_CLASS_ID)
        .sort((left, right) => left.localeCompare(right));
      if (
        !(ids as readonly string[]).includes(ACCEPTED_CLASS_ID) ||
        value.excludedClasses.some(
          (row, index) => row.id !== excludedIds[index]
        )
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Exactly one accepted class may be open; every other class stays excluded once',
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
          [...new Set(sample.reasons)]
            .sort((left, right) => left.localeCompare(right))
            .join(',') ||
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
