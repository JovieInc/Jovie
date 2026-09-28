/**
 * Binds the @jovie/copy landing pipeline to the marketing registry: layout
 * must use an approved recipe, and the design-system stage may only compose
 * registered sections. Policy: canon/VOICE.md, "Landing pages are compiled".
 */
import type { LandingCheck, LandingStage } from '@jovie/copy';
import { MARKETING_RECIPES } from './recipes';
import { MARKETING_SECTIONS } from './sections';

const RECIPE_IDS = new Set<string>(MARKETING_RECIPES.map(recipe => recipe.id));
const SECTION_IDS = new Set<string>(
  MARKETING_SECTIONS.map(section => section.id)
);

export const MARKETING_LANDING_CHECKS: Partial<
  Record<LandingStage, LandingCheck>
> = {
  layout: spec =>
    spec.layout && !RECIPE_IDS.has(spec.layout.recipeId)
      ? [
          {
            stage: 'layout',
            code: 'UNKNOWN_RECIPE',
            ref: spec.layout.recipeId,
            message: `Use an approved recipe: ${[...RECIPE_IDS].join(', ')}.`,
          },
        ]
      : [],
  designSystem: spec =>
    (spec.designSystem?.components ?? [])
      .filter(component => !SECTION_IDS.has(component))
      .map(component => ({
        stage: 'designSystem' as const,
        code: 'UNREGISTERED_COMPONENT',
        ref: component,
        message:
          'Compose only registered marketing sections (apps/web/data/marketing/sections.ts).',
      })),
};
