import { z } from 'zod';

export const summerAdmissionKeys = [
  'newImplementation',
  'ownedRemediation',
  'push',
  'providerEligibility',
  'downstreamHealth',
] as const;

const evidence = z
  .object({
    state: z.enum(['ALLOWED', 'HELD', 'UNKNOWN']),
    sourceSchema: z.enum(['jovie-fleet-gate/v1', 'symphony-concurrency/v1']),
    observedAt: z.string().datetime({ offset: true }).nullable(),
    sourceRevision: z
      .string()
      .regex(/^[a-f0-9]{40}$/u)
      .nullable(),
    sourceDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    reason: z.string().regex(/^[a-z][a-z0-9-]{1,127}$/u),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.state !== 'UNKNOWN' &&
      (!value.observedAt || !value.sourceRevision || !value.sourceDigest)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Known admission requires source evidence',
      });
    }
  });

export const summerAdmissionsSchema = z
  .object({
    schema: z.literal('jovie.eve.summer-admissions-projection/v1'),
    repository: z.literal('JovieInc/Jovie'),
    authorityScope: z.literal(
      'observed-class-admission-task-acceptance-required'
    ),
    newImplementation: evidence,
    ownedRemediation: evidence,
    push: evidence,
    providerEligibility: evidence,
    downstreamHealth: evidence,
  })
  .strict()
  .superRefine((value, context) => {
    for (const key of summerAdmissionKeys) {
      const expected =
        key === 'providerEligibility' || key === 'downstreamHealth'
          ? 'symphony-concurrency/v1'
          : 'jovie-fleet-gate/v1';
      if (value[key].sourceSchema !== expected) {
        context.addIssue({
          code: 'custom',
          path: [key, 'sourceSchema'],
          message: 'Wrong admission authority',
        });
      }
    }
  });
