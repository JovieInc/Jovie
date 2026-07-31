/**
 * JOV-4420 — Marketing Storybook inventory gate.
 *
 * Asserts proven recipes and all section ids are represented as Storybook
 * story names under Marketing/Recipes and Marketing/Sections. Fails on drift.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_STORY_INVENTORY,
  PROVEN_RECIPE_IDS,
  recipeStoryTitle,
  STUB_RECIPE_IDS,
  sectionStoryTitle,
  shellStoryTitle,
  WIP_SECTION_IDS,
} from '@/components/marketing/storybook/catalog';
import {
  isProvenRecipe,
  MARKETING_RECIPE_IDS,
  MARKETING_SECTION_IDS,
} from '@/data/marketing';

const storybookDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../components/marketing/storybook'
);

function readStoryFile(name: string): string {
  return readFileSync(join(storybookDir, name), 'utf8');
}

/** Extract CSF `name: '...'` story names from a stories file. */
function extractStoryNames(source: string): Set<string> {
  const names = new Set<string>();
  const re = /name:\s*'([^']+)'/g;
  for (const match of source.matchAll(re)) {
    const name = match[1];
    if (name) names.add(name);
  }
  return names;
}

describe('marketing Storybook catalog inventory (JOV-4420)', () => {
  const recipesSource = readStoryFile('Recipes.stories.tsx');
  const sectionsSource = readStoryFile('Sections.stories.tsx');
  const shellsSource = readStoryFile('Shells.stories.tsx');

  const recipeNames = extractStoryNames(recipesSource);
  const sectionNames = extractStoryNames(sectionsSource);
  const shellNames = extractStoryNames(shellsSource);

  it('catalog matches the marketing registry recipe/section ids', () => {
    expect([...MARKETING_STORY_INVENTORY.recipeIds]).toEqual([
      ...MARKETING_RECIPE_IDS,
    ]);
    expect([...MARKETING_STORY_INVENTORY.sectionIds]).toEqual([
      ...MARKETING_SECTION_IDS,
    ]);
    for (const id of PROVEN_RECIPE_IDS) {
      expect(isProvenRecipe(id)).toBe(true);
    }
    for (const id of STUB_RECIPE_IDS) {
      expect(isProvenRecipe(id)).toBe(false);
    }
  });

  it('every proven recipe has a Storybook story name under Marketing/Recipes', () => {
    for (const recipeId of PROVEN_RECIPE_IDS) {
      expect(
        recipeNames.has(recipeId),
        `missing recipe story for ${recipeStoryTitle(recipeId)}`
      ).toBe(true);
    }
  });

  it('every section id has a Storybook story name under Marketing/Sections', () => {
    for (const sectionId of MARKETING_SECTION_IDS) {
      expect(
        sectionNames.has(sectionId),
        `missing section story for ${sectionStoryTitle(sectionId)}`
      ).toBe(true);
    }
  });

  it('required shells are story-covered', () => {
    for (const name of MARKETING_STORY_INVENTORY.shellTitles.map(title =>
      title.replace('Marketing/Shells/', '')
    )) {
      expect(
        shellNames.has(name),
        `missing shell story for ${shellStoryTitle(name as never)}`
      ).toBe(true);
    }
  });

  it('WIP section ids are tagged in section stories (not silently omitted)', () => {
    for (const sectionId of WIP_SECTION_IDS) {
      expect(sectionNames.has(sectionId)).toBe(true);
      // Each WIP export should sit near a tags: ['wip'] declaration
      const storyBlock = sectionsSource.includes(`name: '${sectionId}'`);
      expect(storyBlock).toBe(true);
    }
    expect(sectionsSource).toContain("tags: ['wip']");
  });

  it('stub recipes are present and tagged stub', () => {
    for (const recipeId of STUB_RECIPE_IDS) {
      expect(recipeNames.has(recipeId)).toBe(true);
    }
    expect(recipesSource).toContain("tags: ['stub']");
  });

  it('story files use the Marketing/* title roots as string literals', () => {
    // Storybook's CSF indexer requires static string titles (not imported consts).
    expect(recipesSource).toContain("title: 'Marketing/Recipes'");
    expect(sectionsSource).toContain("title: 'Marketing/Sections'");
    expect(shellsSource).toContain("title: 'Marketing/Shells'");
  });

  it('inventory receipt counts are stable and non-empty', () => {
    expect(
      MARKETING_STORY_INVENTORY.provenRecipeTitles.length
    ).toBeGreaterThanOrEqual(8);
    expect(MARKETING_STORY_INVENTORY.sectionTitles).toHaveLength(
      MARKETING_SECTION_IDS.length
    );
    expect(MARKETING_STORY_INVENTORY.shellTitles.length).toBeGreaterThanOrEqual(
      5
    );
  });
});
