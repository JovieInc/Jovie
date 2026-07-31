/**
 * Marketing Storybook catalog — source of truth for title inventory.
 *
 * CI asserts proven recipes + all section ids appear under these title paths.
 * Stories live in Recipes/Sections/Shells.stories.tsx and must keep titles in sync.
 */

import {
  MARKETING_RECIPE_IDS,
  MARKETING_RECIPES,
  MARKETING_SECTION_IDS,
  type MarketingSectionId,
  type RecipeId,
} from '@/data/marketing';

/** Storybook sidebar title prefix for recipe stories. */
export const MARKETING_RECIPE_STORY_ROOT = 'Marketing/Recipes' as const;

/** Storybook sidebar title prefix for section stories. */
export const MARKETING_SECTION_STORY_ROOT = 'Marketing/Sections' as const;

/** Storybook sidebar title prefix for shell/chrome stories. */
export const MARKETING_SHELL_STORY_ROOT = 'Marketing/Shells' as const;

export const PROVEN_RECIPE_IDS: readonly RecipeId[] = MARKETING_RECIPES.filter(
  recipe => recipe.status === 'proven'
).map(recipe => recipe.id);

export const STUB_RECIPE_IDS: readonly RecipeId[] = MARKETING_RECIPES.filter(
  recipe => recipe.status === 'stub'
).map(recipe => recipe.id);

/** Full Storybook title path for a recipe (meta title + story name). */
export function recipeStoryTitle(recipeId: RecipeId): string {
  return `${MARKETING_RECIPE_STORY_ROOT}/${recipeId}`;
}

/** Full Storybook title path for a section. */
export function sectionStoryTitle(sectionId: MarketingSectionId): string {
  return `${MARKETING_SECTION_STORY_ROOT}/${sectionId}`;
}

/**
 * Sections whose registry `component` path is TBD, legacy, or not a direct
 * product import. Stories are tagged `wip` and must still exist (not omitted).
 */
export const WIP_SECTION_IDS: readonly MarketingSectionId[] = [
  'stats', // HomeStatQuoteSection defaults fabricate metrics — zero-proof omit
  'comparison', // data-driven; table composition from content/comparisons
  'ownership', // TBD — ArtistProfileOwnershipSection not shipped
  'content-prose', // route-level blog body; story uses MarketingContentShell prose
  'blog-feed', // BlogCard exists; full feed is route-async
] as const;

export const MARKETING_SHELL_STORY_NAMES = [
  'PublicPageShell',
  'MarketingPageShell',
  'MarketingContentShell',
  'MarketingContainer',
  'HeaderFooterChrome',
  'FinalCta',
] as const;

export type MarketingShellStoryName =
  (typeof MARKETING_SHELL_STORY_NAMES)[number];

export function shellStoryTitle(name: MarketingShellStoryName): string {
  return `${MARKETING_SHELL_STORY_ROOT}/${name}`;
}

/** Inventory receipt for CI / build-storybook count checks. */
export const MARKETING_STORY_INVENTORY = {
  provenRecipeTitles: PROVEN_RECIPE_IDS.map(recipeStoryTitle),
  stubRecipeTitles: STUB_RECIPE_IDS.map(recipeStoryTitle),
  sectionTitles: MARKETING_SECTION_IDS.map(sectionStoryTitle),
  shellTitles: MARKETING_SHELL_STORY_NAMES.map(shellStoryTitle),
  recipeIds: MARKETING_RECIPE_IDS,
  sectionIds: MARKETING_SECTION_IDS,
  wipSectionIds: WIP_SECTION_IDS,
} as const;
