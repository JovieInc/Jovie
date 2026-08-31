import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_SYSTEM_AUTHORITY_MAP,
  DESIGN_SYSTEM_AUTHORITY_MAP_SCHEMA,
  type DesignSystemAuthorityMap,
  validateDesignSystemAuthorityMap,
} from '@/data/designSystem';

const root = path.resolve(__dirname, '../../../../..');

const authorityMapWith = (
  id: string,
  change: (
    entry: DesignSystemAuthorityMap['entries'][number]
  ) => Partial<DesignSystemAuthorityMap['entries'][number]>
): DesignSystemAuthorityMap => ({
  ...DESIGN_SYSTEM_AUTHORITY_MAP,
  entries: DESIGN_SYSTEM_AUTHORITY_MAP.entries.map(entry =>
    entry.id === id ? { ...entry, ...change(entry) } : entry
  ),
});
const authorityCodes = (map: DesignSystemAuthorityMap) =>
  validateDesignSystemAuthorityMap({ map, repoRoot: root }).map(
    issue => issue.code
  );
const expectAuthorityCode = (
  id: string,
  change: (
    entry: DesignSystemAuthorityMap['entries'][number]
  ) => Partial<DesignSystemAuthorityMap['entries'][number]>,
  code: string
) => {
  expect(authorityCodes(authorityMapWith(id, change))).toContain(code);
};

describe('design-system authority map', () => {
  it('classifies root design-system layers in dependency order', () => {
    expect(DESIGN_SYSTEM_AUTHORITY_MAP_SCHEMA).toBe(
      'jovie.design-system-authority/v1'
    );
    expect(validateDesignSystemAuthorityMap({ repoRoot: root })).toEqual([]);
    expect(DESIGN_SYSTEM_AUTHORITY_MAP.dependencyOrder).toEqual(
      DESIGN_SYSTEM_AUTHORITY_MAP.entries.map(entry => entry.id)
    );
    expect(DESIGN_SYSTEM_AUTHORITY_MAP.dependencyOrder.slice(0, 9)).toEqual([
      'foundation.tokens',
      'primitive.components',
      'interaction.families',
      'composition.shared-owners',
      'archetype.product-screens',
      'recipe.marketing-pages',
      'surface.product-routes',
      'surface.marketing-routes',
      'certification.changed-surfaces',
    ]);

    const byId = new Map(
      DESIGN_SYSTEM_AUTHORITY_MAP.entries.map(entry => [entry.id, entry])
    );
    expect(byId.get('interaction.families')).toMatchObject({
      status: 'canonical-enforced',
      dependsOn: ['primitive.components'],
      currentOwners: [{ issue: 'JOV-5429', state: 'Done' }],
    });
    expect(byId.get('surface.marketing-routes')).toMatchObject({
      status: 'duplicated',
      dependsOn: ['recipe.marketing-pages'],
      currentOwners: [{ issue: 'JOV-5745', state: 'In Progress' }],
    });
  });

  it('RED: rejects advisory-only enforcement, status drift, and bad edges', () => {
    expectAuthorityCode(
      'interaction.families',
      () => ({ executableChecks: [] }),
      'missing-authority-check'
    );
    expectAuthorityCode(
      'interaction.families',
      () => ({ classificationReason: '' }),
      'missing-classification-reason'
    );
    expectAuthorityCode(
      'interaction.families',
      () => ({
        canonicalSources: [],
        executableChecks: [],
        classificationReason: 'Regression fixture.',
        status: 'missing',
      }),
      'invalid-authority-status-floor'
    );
    expectAuthorityCode(
      'surface.marketing-routes',
      () => ({ owns: [] }),
      'missing-owned-capability'
    );
    expectAuthorityCode(
      'surface.marketing-routes',
      entry => ({ owns: [...entry.owns, entry.owns[0]] }),
      'duplicate-owned-capability'
    );
    expectAuthorityCode(
      'interaction.families',
      entry => ({ owns: [...entry.owns, 'button'] }),
      'duplicate-owned-capability'
    );
    expectAuthorityCode(
      'surface.marketing-routes',
      entry => ({ owns: [...entry.owns, `${entry.owns[0]} `] }),
      'missing-owned-capability'
    );
    expectAuthorityCode(
      'interaction.families',
      entry => ({ owns: [...entry.owns, 'button '] }),
      'duplicate-owned-capability'
    );
    expectAuthorityCode(
      'interaction.families',
      () => ({ dependsOn: ['surface.product-routes'] }),
      'invalid-dependency-order'
    );
  });

  it('RED: rejects unowned gaps and stale or non-executable evidence', () => {
    expectAuthorityCode(
      'surface.marketing-routes',
      () => ({ currentOwners: [] }),
      'missing-current-owner'
    );
    expectAuthorityCode(
      'surface.marketing-routes',
      entry => ({
        canonicalSources: [...entry.canonicalSources, 'missing/source.ts'],
      }),
      'invalid-repo-path'
    );
    expectAuthorityCode(
      'surface.marketing-routes',
      () => ({ canonicalSources: ['apps/web'] }),
      'invalid-repo-path'
    );
    expectAuthorityCode(
      'interaction.families',
      () => ({ executableChecks: ['scripts'] }),
      'invalid-repo-path'
    );
    expectAuthorityCode(
      'interaction.families',
      () => ({ executableChecks: ['README.md'] }),
      'invalid-authority-check-path'
    );
  });
});
