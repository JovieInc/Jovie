import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_RECIPE_REGISTRY,
  APP_SCREEN_REGISTRY,
  type AppScreenRegistryEntry,
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
