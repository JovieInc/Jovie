import { z } from 'zod';

/** Outcome requirements live on existing surface identities/assurance profiles. */
export interface OutcomeDogfoodMission {
  readonly id: string;
  readonly required?: boolean;
  readonly outcome: {
    readonly revision: number;
    readonly persona: string;
    readonly goal: string;
    readonly successCriteria: readonly string[];
    readonly frictionBudget: {
      readonly maxDurationMs: number;
      readonly maxRetries: number;
      readonly maxCostUsd?: number;
    };
  };
}

const evidenceRefs = z.array(z.string().trim().min(1)).min(1);

export const dogfoodMissionObservationSchema = z
  .object({
    purpose: z.enum(['capability', 'regression']),
    method: z.enum(['goal_driven', 'scripted']),
    missionRevision: z.number().int().positive(),
    goalCompletion: z.enum(['completed', 'partial', 'not_completed']),
    correctness: z.enum(['correct', 'incorrect', 'unverified']),
    resultingState: z.string().trim().min(1),
    checks: z
      .array(
        z.object({
          criterion: z.string().trim().min(1),
          status: z.enum(['passed', 'failed', 'unverified']),
          evidenceRefs,
        })
      )
      .min(1),
    friction: z.object({
      assessment: z.enum(['acceptable', 'unacceptable']),
      details: z.array(z.string().trim().min(1)),
    }),
    recovery: z.object({
      retries: z.number().int().nonnegative(),
      details: z.array(z.string().trim().min(1)),
    }),
    durationMs: z.number().finite().nonnegative(),
    resources: z.discriminatedUnion('status', [
      z.object({
        status: z.literal('measured'),
        costUsd: z.number().finite().nonnegative(),
        usage: z
          .array(
            z.object({
              unit: z.string().trim().min(1),
              quantity: z.number().finite().nonnegative(),
            })
          )
          .min(1),
      }),
      z.object({
        status: z.enum(['not_applicable', 'unavailable']),
        reason: z.string().trim().min(1),
      }),
    ]),
  })
  .superRefine((observation, ctx) => {
    if (
      observation.friction.assessment === 'unacceptable' &&
      observation.friction.details.length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'unacceptable friction needs details',
      });
    }
    if (
      observation.recovery.retries > 0 &&
      observation.recovery.details.length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'retries need recovery details',
      });
    }
  });

export type DogfoodMissionObservation = z.infer<
  typeof dogfoodMissionObservationSchema
>;

/** Completion and certification are deliberately separate judgments. */
export function missionObservationPasses(
  observation: DogfoodMissionObservation,
  mission?: OutcomeDogfoodMission
): boolean {
  if (
    observation.purpose !== 'capability' ||
    observation.method !== 'goal_driven' ||
    observation.goalCompletion !== 'completed' ||
    observation.correctness !== 'correct' ||
    observation.friction.assessment !== 'acceptable' ||
    observation.resources.status === 'unavailable' ||
    observation.checks.some(check => check.status !== 'passed')
  )
    return false;
  if (!mission) return true;
  const { revision, successCriteria, frictionBudget } = mission.outcome;
  return (
    observation.missionRevision === revision &&
    successCriteria.length > 0 &&
    successCriteria.every(criterion =>
      observation.checks.some(check => check.criterion === criterion)
    ) &&
    observation.durationMs <= frictionBudget.maxDurationMs &&
    observation.recovery.retries <= frictionBudget.maxRetries &&
    (frictionBudget.maxCostUsd === undefined ||
      (observation.resources.status === 'measured' &&
        observation.resources.costUsd <= frictionBudget.maxCostUsd))
  );
}
