/**
 * Factory page brief (JOV-7276): everything `factory:run` needs for one page.
 * Briefs live in briefs/<family>/<slug>.json. The `dry` block holds the
 * canned strategist and copywriter output that `--dry` replays offline; live
 * runs ignore it and ask the routed models instead.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MarketingBriefSchema } from '../../data/marketing/composition';
import type { HeroDecisionInput } from '../../data/marketing/factory/heroDecision';
import { FactoryMediaDecisionInputSchema } from '../../data/marketing/factory/mediaDecision';
import { CompetitiveResearchSchema } from '../../data/marketing/factory/persuasionBrief';
import { SectionJobNeedSchema } from '../../data/marketing/factory/sectionRequest';
import { EditorialMediaIntentSchema } from '../../data/marketing/factory/spine';
import { PROOF_KINDS } from '../../data/product-truth/proof';

const Id = z.string().min(1);

export const FactoryPageBriefSchema = z.object({
  family: z.string().regex(/^[a-z0-9-]+$/u),
  slug: z.string().regex(/^[a-z0-9-]+$/u),
  route: z.string().startsWith('/'),
  /** Deterministic "today" for proof freshness and receipt reproducibility. */
  asOf: z.iso.date(),
  brief: MarketingBriefSchema,
  icp: Id,
  jobsToBeDone: z.array(Id).min(1),
  /** The only product-truth claims this page may make. */
  claimIds: z.array(Id).min(1),
  /**
   * Competitive persuasion research (JOV-7335). Required: the persuasion
   * stage runs before composition and a page cannot render without it.
   */
  persuasion: CompetitiveResearchSchema,
  sectionJobs: z.array(SectionJobNeedSchema).default([]),
  /** Repeated story families require a deliberate layout for each occurrence. */
  sectionVariants: z.record(Id, Id).optional(),
  /** Typed by heroDecision.ts; the harness checks it through selectHeroDecision. */
  hero: z.custom<HeroDecisionInput>(
    value => typeof value === 'object' && value !== null && 'useCase' in value
  ),
  proof: z
    .array(
      z.object({
        sectionInstanceId: Id,
        kind: z.enum(PROOF_KINDS),
        claimId: Id,
        fallbackKinds: z.array(z.enum(PROOF_KINDS)).optional(),
      })
    )
    .default([]),
  media: z
    .array(
      z.object({
        sectionInstanceId: Id,
        input: FactoryMediaDecisionInputSchema,
      })
    )
    .min(1),
  seo: z.object({
    siblingLinks: z.array(z.string().startsWith('/')).min(3).max(5),
    jsonLdTypes: z.array(Id).min(1),
  }),
  /** Canned generator output for `--dry`, keyed by the model-produced stage. */
  dry: z
    .object({
      outcomes: z.unknown(),
      narrative: z.unknown(),
      copy: z.unknown(),
      render: z.object({ cls: z.number(), lcpMs: z.number() }),
    })
    .optional(),
});

/** Legacy receipts remain readable; newly executed live work requires authored intent. */
export const FactoryEditorialPageBriefSchema = FactoryPageBriefSchema.extend({
  media: z
    .array(
      z.object({
        sectionInstanceId: Id,
        input: FactoryMediaDecisionInputSchema.extend({
          editorial: EditorialMediaIntentSchema,
        }),
      })
    )
    .min(1),
});

export type FactoryPageBrief = z.infer<typeof FactoryPageBriefSchema>;

export const FACTORY_BRIEFS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  'briefs'
);

export function factoryPageId(family: string, slug: string): string {
  return `${family}-${slug}`;
}

export function loadFactoryBrief(
  family: string,
  slug: string,
  dir: string = FACTORY_BRIEFS_DIR
): FactoryPageBrief {
  const path = join(dir, family, `${slug}.json`);
  return FactoryPageBriefSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
