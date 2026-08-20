import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_PEN_EXPORT_SCHEMA,
  APP_SCREEN_RECIPE_REGISTRY,
  APP_SCREEN_REGISTRY,
  type AppScreenRegistryEntry,
  buildAppScreenPenExport,
  validateAppScreenSystem,
} from '@/data/appScreens';

const repoRoot = path.resolve(__dirname, '../../../../..');
const shellRoot = path.join(repoRoot, 'apps/web/app/app/(shell)');

function listPageSources(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return listPageSources(absolute);
      if (entry.name !== 'page.tsx') return [];
      return [path.relative(repoRoot, absolute)];
    })
    .sort();
}

describe('authenticated app screen registry', () => {
  it('registers every authenticated shell page exactly once', () => {
    expect(APP_SCREEN_REGISTRY.map(entry => entry.source).sort()).toEqual(
      listPageSources(shellRoot)
    );
    expect(APP_SCREEN_REGISTRY).toHaveLength(94);
  });

  it('has a valid registered recipe and component composition', () => {
    expect(validateAppScreenSystem()).toEqual([]);
    expect(new Set(APP_SCREEN_REGISTRY.map(entry => entry.kind))).toEqual(
      new Set(['canonical', 'alias', 'legacy', 'operator'])
    );
  });

  it('backs every registered component with its real Storybook title', () => {
    for (const component of APP_SCREEN_COMPONENT_REGISTRY) {
      expect(fs.existsSync(path.join(repoRoot, component.source))).toBe(true);
      const storyPath = path.join(repoRoot, component.storySource);
      expect(fs.existsSync(storyPath), component.id).toBe(true);
      expect(fs.readFileSync(storyPath, 'utf8'), component.id).toContain(
        `title: '${component.storybookTitle}'`
      );
    }
  });

  it('keeps authenticated shared components source-backed but non-referenceable until a native Pen root is proven', () => {
    for (const component of APP_SCREEN_COMPONENT_REGISTRY) {
      expect(component.penRootId, component.id).toBeNull();
      expect(component.penReferenceEligible, component.id).toBe(false);
      expect(component.penIdentityReason, component.id).toMatch(
        /native canonical-Pen .*root is source-mapped/i
      );
    }
  });

  it('keeps every recipe behind a real error boundary', () => {
    for (const recipe of APP_SCREEN_RECIPE_REGISTRY) {
      expect(
        fs.existsSync(path.join(repoRoot, recipe.errorBoundarySource)),
        recipe.id
      ).toBe(true);
    }
  });

  it('never treats redirecting routes as design references', () => {
    for (const screen of APP_SCREEN_REGISTRY) {
      const source = fs.readFileSync(
        path.join(repoRoot, screen.source),
        'utf8'
      );
      if (/\b(?:permanentRedirect|redirect)\s*\(/.test(source)) {
        expect(screen.designReference, screen.route).toBe(false);
      }
    }
  });

  it('assigns exactly 46 unique deterministic browser-safe story IDs', () => {
    const references = APP_SCREEN_REGISTRY.filter(
      entry => entry.designReference
    );
    // Source-of-truth pin: the Pen lane must derive this count from the
    // export receipt, never hardcode it. /app/ov/ops is a redirect to /hud.
    expect(references).toHaveLength(46);
    const storyIds = references.map(entry => {
      expect(entry.story, entry.route).not.toBeNull();
      return entry.story?.id as string;
    });
    expect(new Set(storyIds).size).toBe(storyIds.length);
    for (const storyId of storyIds) {
      expect(
        storyId,
        `${storyId} must be browser-safe (<kind>--<story>, lowercase, dashes)`
      ).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    // Deterministic: rebuilding the story id from the concept is stable.
    for (const entry of references) {
      expect(entry.story?.recipeId).toBe(entry.recipeId);
      const recipe = APP_SCREEN_RECIPE_REGISTRY.find(
        r => r.id === entry.recipeId
      );
      expect(entry.story?.componentIds).toEqual(recipe?.componentIds);
    }
  });

  it('resolves every alias/legacy route without a duplicate design body', () => {
    const compatibility = APP_SCREEN_REGISTRY.filter(
      entry => entry.kind === 'alias' || entry.kind === 'legacy'
    );
    expect(compatibility).toHaveLength(32);
    const referenceConcepts = new Set(
      APP_SCREEN_REGISTRY.filter(entry => entry.designReference).map(
        entry => entry.conceptId
      )
    );
    for (const entry of compatibility) {
      expect(entry.designReference, entry.route).toBe(false);
      expect(entry.story, entry.route).toBeNull();
      if (entry.conceptId === entry.route) {
        // Legacy-owned body: the only screen allowed to keep its own concept.
        expect(entry.redirectTo, entry.route).toBeNull();
      } else {
        expect(
          referenceConcepts.has(entry.conceptId),
          `${entry.route} concept ${entry.conceptId} must be a design reference`
        ).toBe(true);
      }
      const source = fs.readFileSync(path.join(repoRoot, entry.source), 'utf8');
      if (/\b(?:permanentRedirect|redirect)\s*\(/.test(source)) {
        expect(entry.redirectTo, entry.route).not.toBeNull();
      }
    }
    // No alias/legacy concept may collide with a second design body.
    const bodiesByConcept = new Map<string, number>();
    for (const entry of APP_SCREEN_REGISTRY) {
      if (!entry.designReference) continue;
      bodiesByConcept.set(
        entry.conceptId,
        (bodiesByConcept.get(entry.conceptId) ?? 0) + 1
      );
    }
    for (const count of bodiesByConcept.values()) {
      expect(count).toBe(1);
    }
  });

  it('emits a deterministic Pen export receipt with derived counts', () => {
    const receipt = buildAppScreenPenExport({
      hashSource: source => `sha256:${source.length}`,
    });
    expect(receipt.schema).toBe(APP_SCREEN_PEN_EXPORT_SCHEMA);
    expect(receipt.counts).toEqual({
      screens: APP_SCREEN_REGISTRY.length,
      designReferences: 46,
      components: APP_SCREEN_COMPONENT_REGISTRY.length,
      recipes: APP_SCREEN_RECIPE_REGISTRY.length,
    });
    expect(receipt.screens).toHaveLength(APP_SCREEN_REGISTRY.length);
    expect(receipt.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'component.app-shell-frame',
          penRootId: null,
          penReferenceEligible: false,
          penIdentityReason: expect.stringMatching(
            /native canonical-Pen app-shell root/i
          ),
        }),
      ])
    );
    const routes = receipt.screens.map(screen => screen.route);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes).toEqual([...routes].sort((a, b) => a.localeCompare(b)));
    for (const screen of receipt.screens) {
      expect(screen.id).toMatch(/^screen\./);
      expect(screen.sourceSha).toBe(`sha256:${screen.source.length}`);
      expect(screen.componentIds.length).toBeGreaterThan(0);
      if (screen.designReference) {
        expect(screen.storyId, screen.route).toMatch(
          /^app-screens-[a-z0-9-]+--reference$/
        );
        expect(screen.redirectTo).toBeNull();
      } else {
        expect(screen.storyId, screen.route).toBeNull();
      }
    }
    // Rebuilding without hashes is identical apart from sourceSha.
    const unhashed = buildAppScreenPenExport();
    expect({
      ...unhashed,
      screens: unhashed.screens.map(screen => ({ ...screen, sourceSha: null })),
    }).toEqual({
      ...receipt,
      screens: receipt.screens.map(screen => ({ ...screen, sourceSha: null })),
    });
  });

  it('fails closed on one-offs, duplicate concepts, and invalid composition', () => {
    const canonical = APP_SCREEN_REGISTRY.find(
      entry => entry.designReference
    ) as AppScreenRegistryEntry;
    const invalid = [
      ...APP_SCREEN_REGISTRY,
      {
        ...canonical,
        id: 'screen.invalid-one-off' as const,
        source: canonical.source,
        route: canonical.route,
      },
    ];
    expect(
      validateAppScreenSystem({ screens: invalid }).map(x => x.code)
    ).toEqual(
      expect.arrayContaining([
        'duplicate-source',
        'duplicate-route',
        'duplicate-reference-concept',
      ])
    );
    expect(
      validateAppScreenSystem({
        screens: [
          {
            ...canonical,
            recipeId: 'recipe.missing' as never,
          },
        ],
      }).map(x => x.code)
    ).toContain('missing-recipe');
  });

  it('fails closed on unproven or duplicate authenticated component Pen roots', () => {
    const [first, second] = APP_SCREEN_COMPONENT_REGISTRY;

    expect(
      validateAppScreenSystem({
        components: APP_SCREEN_COMPONENT_REGISTRY.map(component =>
          component.id === first.id
            ? { ...component, penReferenceEligible: true }
            : component
        ),
      }).map(issue => issue.code)
    ).toContain('reference-component-without-pen-root');

    expect(
      validateAppScreenSystem({
        components: APP_SCREEN_COMPONENT_REGISTRY.map(component =>
          component.id === first.id
            ? { ...component, penIdentityReason: undefined }
            : component
        ),
      }).map(issue => issue.code)
    ).toContain('unresolved-component-pen-identity-without-reason');

    expect(
      validateAppScreenSystem({
        components: APP_SCREEN_COMPONENT_REGISTRY.map(component =>
          component.id === first.id || component.id === second.id
            ? {
                ...component,
                penRootId: 'native-root-id',
                penReferenceEligible: true,
                penIdentityReason: undefined,
              }
            : component
        ),
      }).map(issue => issue.code)
    ).toContain('duplicate-component-pen-root');
  });

  it('fails closed on missing, duplicated, or unsafe design-reference stories', () => {
    const canonical = APP_SCREEN_REGISTRY.find(
      entry => entry.designReference
    ) as AppScreenRegistryEntry;
    const story = canonical.story as NonNullable<
      AppScreenRegistryEntry['story']
    >;

    // Missing story on a design reference.
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === canonical.id ? { ...entry, story: null } : entry
        ),
      }).map(x => x.code)
    ).toContain('missing-story');

    // Duplicated story id across two design references.
    const other = APP_SCREEN_REGISTRY.find(
      entry => entry.designReference && entry.id !== canonical.id
    ) as AppScreenRegistryEntry;
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === other.id ? { ...entry, story } : entry
        ),
      }).map(x => x.code)
    ).toContain('duplicate-story');

    // Browser-unsafe story id.
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === canonical.id
            ? { ...entry, story: { ...story, id: 'App Screens/Main Body' } }
            : entry
        ),
      }).map(x => x.code)
    ).toContain('unsafe-story');

    // Story that does not use its declared recipe/components.
    const wrongRecipeId = APP_SCREEN_RECIPE_REGISTRY.find(
      r => r.id !== canonical.recipeId
    )?.id as AppScreenRegistryEntry['recipeId'];
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === canonical.id
            ? { ...entry, story: { ...story, recipeId: wrongRecipeId } }
            : entry
        ),
      }).map(x => x.code)
    ).toContain('story-recipe-mismatch');
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === canonical.id
            ? {
                ...entry,
                story: { ...story, componentIds: ['component.empty-state'] },
              }
            : entry
        ),
      }).map(x => x.code)
    ).toContain('story-component-mismatch');

    // Story contract on a non-reference screen.
    const alias = APP_SCREEN_REGISTRY.find(
      entry => entry.kind === 'alias'
    ) as AppScreenRegistryEntry;
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === alias.id ? { ...entry, story } : entry
        ),
      }).map(x => x.code)
    ).toContain('unexpected-story');
  });

  it('fails closed when an alias/legacy route loses its canonical concept', () => {
    const alias = APP_SCREEN_REGISTRY.find(
      entry => entry.kind === 'alias'
    ) as AppScreenRegistryEntry;

    // Concept pointed at itself without being a registered legacy body.
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === alias.id
            ? { ...entry, conceptId: entry.route, redirectTo: null }
            : entry
        ),
      }).map(x => x.code)
    ).toContain('unresolved-concept');

    // Concept pointed at a route that is not a design reference.
    const nonReference = APP_SCREEN_REGISTRY.find(
      entry => !entry.designReference && entry.id !== alias.id
    ) as AppScreenRegistryEntry;
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === alias.id
            ? { ...entry, conceptId: nonReference.route }
            : entry
        ),
      }).map(x => x.code)
    ).toContain('unresolved-concept');

    // Redirect receipt on a canonical screen.
    const canonical = APP_SCREEN_REGISTRY.find(
      entry => entry.designReference
    ) as AppScreenRegistryEntry;
    expect(
      validateAppScreenSystem({
        screens: APP_SCREEN_REGISTRY.map(entry =>
          entry.id === canonical.id
            ? { ...entry, redirectTo: '/app/elsewhere' }
            : entry
        ),
      }).map(x => x.code)
    ).toContain('unexpected-redirect-receipt');
  });

  it('keeps success, warning, and error on Mint, Gold, and Flare aliases', () => {
    const tokens = fs.readFileSync(
      path.join(repoRoot, 'apps/web/styles/design-system.css'),
      'utf8'
    );
    expect(tokens).toMatch(/--color-success:\s*var\(--color-accent-green\);/);
    expect(tokens).toMatch(/--color-warning:\s*var\(--color-accent-orange\);/);
    expect(tokens).toMatch(/--color-error:\s*var\(--color-accent-red\);/);
    expect(tokens).not.toMatch(/--color-(?:success|warning|error):\s*#/);
  });
});
