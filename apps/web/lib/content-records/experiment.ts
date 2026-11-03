import { z } from 'zod';
import { SIGNUP_FUNNEL_STEPS } from '@/lib/analytics/signup-funnel';

/**
 * Experiment contract shared by every content kind that can be tested. A
 * record carries its control inline; an experiment adds named variants with
 * integer traffic weights and the one conversion metric the test is judged
 * on. The control keeps whatever weight the variants leave (100 - sum).
 *
 * Metrics name a step of an existing signup funnel (`signup-funnel/v2`), so a
 * test is judged on the same events Summer's activation funnel already counts.
 */

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase slug')
  .max(48);

const ARTIST_STEPS = SIGNUP_FUNNEL_STEPS.artist_signup;

export const ExperimentMetricSchema = z
  .object({
    funnel: z.literal('artist_signup'),
    /** Conversion step, measured from `landing_view` on this page. */
    step: z.enum(ARTIST_STEPS).exclude(['landing_view']),
  })
  .strict();

export const EXPERIMENT_STATUSES = ['draft', 'running', 'stopped'] as const;

export function experimentSchema<V extends z.ZodTypeAny>(variantBody: V) {
  return z
    .object({
      id: slug,
      hypothesis: z.string().trim().min(10).max(300),
      metric: ExperimentMetricSchema,
      status: z.enum(EXPERIMENT_STATUSES),
      variants: z
        .array(
          z
            .object({
              id: slug.refine(id => id !== 'control', {
                message: '`control` is reserved for the base record',
              }),
              weight: z.number().int().min(0).max(100),
              body: variantBody,
            })
            .strict()
        )
        .min(1)
        .max(8),
    })
    .strict()
    .superRefine((experiment, ctx) => {
      const total = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
      if (total > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants'],
          message: `Variant weights sum to ${total}; the maximum is 100`,
        });
      }
      const ids = new Set<string>();
      for (const variant of experiment.variants) {
        if (ids.has(variant.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['variants'],
            message: `Duplicate variant id: ${variant.id}`,
          });
        }
        ids.add(variant.id);
      }
    });
}

export interface ExperimentShape<B> {
  readonly id: string;
  readonly status: (typeof EXPERIMENT_STATUSES)[number];
  readonly variants: readonly {
    readonly id: string;
    readonly weight: number;
    readonly body: B;
  }[];
}

/** FNV-1a 32-bit; stable across runtimes, no crypto dependency. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic bucket for one visitor in one experiment: the same visitor
 * id always lands in the same arm, and arms fill in declared order. Returns
 * `control` when the experiment is not running.
 */
export function assignExperimentArm<B>(
  experiment: ExperimentShape<B> | undefined,
  visitorId: string
): string {
  if (!experiment || experiment.status !== 'running') return 'control';
  const bucket = fnv1a(`${experiment.id}:${visitorId}`) % 100;
  let threshold = 0;
  for (const variant of experiment.variants) {
    threshold += variant.weight;
    if (bucket < threshold) return variant.id;
  }
  return 'control';
}

/** Body for an arm id; unknown ids and `control` return the control body. */
export function experimentArmBody<B>(
  control: B,
  experiment: ExperimentShape<B> | undefined,
  armId: string | null | undefined
): B {
  if (!experiment || !armId || armId === 'control') return control;
  return experiment.variants.find(v => v.id === armId)?.body ?? control;
}
