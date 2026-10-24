import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SkillDefinition } from '@/lib/agents/types';
import { GrowthGovernanceSchema } from '@/lib/playbooks/growth-governance';

const reference = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

/** Optional planning evidence on the existing launch; never action authority. */
export const LaunchGrowthPreparationSchema = z.strictObject({
  version: z.literal('launch-growth-preparation/v1'),
  tenantId: reference,
  representedIdentityId: reference,
  sourceRevision: reference,
  productBuild: reference,
  offerVersion: reference,
  destinationRef: reference,
  hypothesis: reference,
  scope: reference,
  budgetUsd: z.number().nonnegative().nullable(),
  capacity: z.number().int().nonnegative().nullable(),
  authority: z.literal('private_preparation_only'),
  observationWindow: reference,
  /** No fabricated zero result when observation has not been commissioned. */
  outcome: z.literal('unobserved'),
  selected: z
    .array(
      z.strictObject({
        id: reference,
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
        sourceSha256: sha256,
        fit: reference,
        governance: GrowthGovernanceSchema,
      })
    )
    .min(1),
});

export type LaunchGrowthPreparation = z.infer<
  typeof LaunchGrowthPreparationSchema
>;

/** Carry compiled provenance, including all restrictions, without inventing tools. */
export function selectGrowthPreparation(
  skill: SkillDefinition,
  fit: string
): LaunchGrowthPreparation['selected'][number] {
  if (skill.lifecycle !== 'draft' || skill.metadata.surface !== 'playbook') {
    throw new Error('growth preparation selection requires a compiled draft');
  }
  return LaunchGrowthPreparationSchema.shape.selected.element.parse({
    id: skill.id,
    version: skill.version,
    sourceSha256: skill.metadata.playbookSourceSha256,
    fit,
    governance: JSON.parse(skill.metadata.growthGovernance ?? 'null'),
  });
}

export function growthPreparationFingerprint(
  plan: LaunchGrowthPreparation
): string {
  return createHash('sha256')
    .update(JSON.stringify(LaunchGrowthPreparationSchema.parse(plan)))
    .digest('hex');
}
