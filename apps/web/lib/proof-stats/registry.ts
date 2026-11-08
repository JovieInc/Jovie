import { z } from 'zod';
import registryJson from '@/data/proof-stats/registry.json';

/**
 * The proof-stat registry (`apps/web/data/proof-stats/registry.json`): one
 * definition per public or internal number Jovie states. Copy never writes
 * the number; it binds to a stat id (`{stat:accounts_total}`) and the value
 * comes from the latest observation. Pure and client-safe.
 */

export const PROOF_STAT_REGISTRY_SCHEMA = 'jovie.proof-stats.registry/v1';

const roundingSchema = z
  .object({
    /** floor never overstates a count; ceil never overstates speed. */
    mode: z.enum(['floor', 'ceil', 'exact']),
    /** Significant digits kept (floor/ceil). Mutually exclusive with step. */
    sigDigits: z.number().int().min(1).max(4).optional(),
    /** Round to a multiple of step (floor/ceil). */
    step: z.number().positive().optional(),
    suffix: z.string().max(2).optional(),
    /** 100000 -> "100k". */
    compact: z.boolean().optional(),
    /** 0.42 -> "42%". */
    percent: z.boolean().optional(),
  })
  .strict()
  .refine(r => !(r.sigDigits && r.step), {
    message: 'rounding takes sigDigits or step, not both',
  });

export const proofStatDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/u),
    label: z.string().min(3).max(120),
    unit: z.enum([
      'count',
      'ms',
      'bytes',
      'score',
      'ratio',
      'hours',
      'minutes',
    ]),
    better: z.enum(['higher', 'lower']),
    /** internal stats never render on a public surface. */
    visibility: z.enum(['public', 'internal']),
    /** comparative and health claims need founder approval before rendering. */
    legalClass: z.enum(['plain', 'comparative', 'health']),
    /** Lifecycle Summer drives: proposed -> measuring -> live -> retired. */
    status: z.enum(['proposed', 'measuring', 'live', 'retired']),
    source: z
      .object({
        kind: z.enum([
          'production',
          'benchmark',
          'wins-ledger',
          'agent-score',
          'security',
          'engineering',
        ]),
        ref: z.string().min(1),
        /** Public-benchmark claim id gating a comparative stat. */
        claim: z.string().optional(),
        note: z.string().min(10),
      })
      .strict(),
    owner: z.string().min(2),
    refreshCadence: z.enum(['hourly', 'daily', 'weekly']),
    freshnessSlaHours: z.number().positive(),
    /** Minimum value before display (higher-is-better). null: no floor. */
    threshold: z.number().nullable(),
    /** Maximum value before display (lower-is-better). */
    ceiling: z.number().optional(),
    display: z
      .object({
        sentence: z.string().min(3).max(140),
        rounding: roundingSchema,
      })
      .strict(),
    /** Shown instead of the sentence when the stat cannot render. null: hide. */
    fallback: z.string().min(3).max(140).nullable(),
    methodology: z.string().startsWith('/').nullable(),
    /** Plain-language method for the public methodology page. */
    publicMethod: z.string().min(20).max(400).optional(),
    milestones: z.boolean(),
    marketing: z
      .object({
        value: z.number().int().min(1).max(5),
        feasibility: z.number().int().min(1).max(5),
        why: z.string().min(10),
      })
      .strict(),
  })
  .strict()
  .refine(s => s.visibility === 'internal' || s.methodology, {
    path: ['methodology'],
    message: 'a public stat needs a methodology link',
  })
  .refine(s => s.visibility === 'internal' || s.publicMethod, {
    path: ['publicMethod'],
    message: 'a public stat needs a plain-language method',
  })
  .refine(
    s =>
      s.display.sentence.includes('{value}') ||
      s.ceiling !== undefined ||
      s.threshold !== null,
    {
      path: ['display', 'sentence'],
      message:
        'a sentence without {value} states a fixed fact and needs a threshold or ceiling that makes it true',
    }
  );

export type ProofStatDefinition = z.infer<typeof proofStatDefinitionSchema>;

export const proofStatRegistrySchema = z
  .object({
    schema: z.literal(PROOF_STAT_REGISTRY_SCHEMA),
    rule: z.string(),
    milestones: z.array(z.number().positive()).min(1),
    stats: z.array(proofStatDefinitionSchema).min(1),
  })
  .strict()
  .superRefine((registry, ctx) => {
    const seen = new Set<string>();
    for (const [index, stat] of registry.stats.entries()) {
      if (seen.has(stat.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['stats', index, 'id'],
          message: `duplicate stat id ${stat.id}`,
        });
      }
      seen.add(stat.id);
      if (stat.legalClass === 'comparative' && !stat.source.claim) {
        ctx.addIssue({
          code: 'custom',
          path: ['stats', index, 'source', 'claim'],
          message: 'a comparative stat names the benchmark claim that gates it',
        });
      }
    }
  });

export type ProofStatRegistry = z.infer<typeof proofStatRegistrySchema>;

export const PROOF_STAT_REGISTRY: ProofStatRegistry =
  proofStatRegistrySchema.parse(registryJson);

const BY_ID = new Map(PROOF_STAT_REGISTRY.stats.map(stat => [stat.id, stat]));

export function getProofStat(id: string): ProofStatDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function listProofStats(): readonly ProofStatDefinition[] {
  return PROOF_STAT_REGISTRY.stats;
}
