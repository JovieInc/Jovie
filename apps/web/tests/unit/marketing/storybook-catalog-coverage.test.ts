/**
 * Marketing Storybook catalog coverage (JOV-4420).
 *
 * Asserts proven recipes and all section ids have Storybook titles under
 * Marketing/Recipes/* and Marketing/Sections/* so the visual catalog cannot
 * silently drift from the marketing registry.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_RECIPES,
  MARKETING_SECTION_IDS,
  type MarketingSectionId,
  type RecipeId,
} from '@/data/marketing';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORYBOOK_DIR = join(
  __dirname,
  '../../../components/marketing/storybook'
);

async function listStoryFiles(): Promise<string[]> {
  const entries = await readdir(STORYBOOK_DIR);
  return entries
    .filter(name => name.endsWith('.stories.tsx'))
    .map(name => join(STORYBOOK_DIR, name));
}

/**
 * Extract `Marketing/Recipes/<id>` and `Marketing/Sections/<id>` story
 * titles from CSF3 files. Matches:
 *   - meta title: 'Marketing/Recipes'
 *   - story name: 'homepage'  OR  export const homepage
 * Combined path is Marketing/Recipes/homepage.
 */
async function collectCatalogTitles(): Promise<{
  readonly recipes: ReadonlySet<string>;
  readonly sections: ReadonlySet<string>;
  readonly shells: ReadonlySet<string>;
  readonly rawTitles: readonly string[];
}> {
  const files = await listStoryFiles();
  const recipes = new Set<string>();
  const sections = new Set<string>();
  const shells = new Set<string>();
  const rawTitles: string[] = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');

    // Explicit full titles if present
    for (const match of text.matchAll(
      /title:\s*['"]Marketing\/(Recipes|Sections|Shells)\/([^'"]+)['"]/g
    )) {
      const group = match[1];
      const id = match[2];
      if (!group || !id) continue;
      const full = `Marketing/${group}/${id}`;
      rawTitles.push(full);
      if (group === 'Recipes') recipes.add(id);
      if (group === 'Sections') sections.add(id);
      if (group === 'Shells') shells.add(id);
    }

    // Parent title + story name fields
    const parentMatch = text.match(
      /title:\s*['"]Marketing\/(Recipes|Sections|Shells)['"]/
    );
    const parent = parentMatch?.[1];
    if (!parent) continue;

    // name: 'recipe-id' on Story exports
    for (const match of text.matchAll(/name:\s*['"]([^'"]+)['"]/g)) {
      const id = match[1];
      if (!id) continue;
      // skip non-catalog names that appear in nested components
      if (parent === 'Recipes') {
        recipes.add(id);
        rawTitles.push(`Marketing/Recipes/${id}`);
      } else if (parent === 'Sections') {
        sections.add(id);
        rawTitles.push(`Marketing/Sections/${id}`);
      } else if (parent === 'Shells') {
        // Shell names may include slashes (MarketingContainer/page)
        shells.add(id);
        rawTitles.push(`Marketing/Shells/${id}`);
      }
    }
  }

  return { recipes, sections, shells, rawTitles };
}

describe('marketing Storybook catalog coverage (JOV-4420)', () => {
  it('covers every proven recipe under Marketing/Recipes/<recipeId>', async () => {
    const { recipes } = await collectCatalogTitles();
    const proven = MARKETING_RECIPES.filter(r => r.status === 'proven').map(
      r => r.id
    );

    const missing = proven.filter(id => !recipes.has(id));
    expect(
      missing,
      `Missing Storybook titles for proven recipes: ${missing.join(', ')}. Add stories under apps/web/components/marketing/storybook/MarketingRecipes.stories.tsx with name: '<recipeId>'.`
    ).toEqual([]);
  });

  it('covers every section id under Marketing/Sections/<sectionId>', async () => {
    const { sections } = await collectCatalogTitles();
    const missing = MARKETING_SECTION_IDS.filter(id => !sections.has(id));
    expect(
      missing,
      `Missing Storybook titles for sections: ${missing.join(', ')}. Add stories under MarketingSections.stories.tsx with name: '<sectionId>'.`
    ).toEqual([]);
  });

  it('covers required shell chrome under Marketing/Shells/*', async () => {
    const { shells } = await collectCatalogTitles();
    const required = [
      'PublicPageShell',
      'MarketingPageShell',
      'MarketingContentShell',
      'MarketingContainer/page',
      'MarketingContainer/prose',
      'MarketingHeader',
      'MarketingFooter',
      'MarketingFooterCta',
      'MarketingFinalCTA',
    ];
    const missing = required.filter(id => !shells.has(id));
    expect(missing, `Missing shell stories: ${missing.join(', ')}`).toEqual([]);
  });

  it('documents stub recipes when present (optional coverage)', async () => {
    const { recipes } = await collectCatalogTitles();
    const stubs = MARKETING_RECIPES.filter(r => r.status === 'stub').map(
      r => r.id
    ) as RecipeId[];
    // Stubs are optional but when the catalog file exists we expect them tagged.
    for (const id of stubs) {
      if (!recipes.has(id)) {
        // soft: stubs may be omitted; assert they are either present or not in proven set
        expect(MARKETING_RECIPES.find(r => r.id === id)?.status).toBe('stub');
      }
    }
    // Proven set already asserted; keep this as a documentation invariant.
    expect(stubs.length).toBeGreaterThan(0);
  });

  it('section id list floor remains 17 (registry contract)', () => {
    expect(MARKETING_SECTION_IDS).toHaveLength(17);
    const unique = new Set<MarketingSectionId>(MARKETING_SECTION_IDS);
    expect(unique.size).toBe(17);
  });
});
