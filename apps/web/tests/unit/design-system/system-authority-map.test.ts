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
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', () => ({
          executableChecks: [],
        }))
      )
    ).toContain('missing-authority-check');
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', () => ({
          classificationReason: '',
        }))
      )
    ).toContain('missing-classification-reason');
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', () => ({
          canonicalSources: [],
          executableChecks: [],
          classificationReason: 'Regression fixture.',
          status: 'missing',
        }))
      )
    ).toContain('invalid-authority-status-floor');
    expect(
      authorityCodes(
        authorityMapWith('foundation.tokens', () => ({
          status: 'canonical-enforced',
        }))
      )
    ).toContain('invalid-authority-status-floor');
    expect(
      authorityCodes(
        authorityMapWith('foundation.tokens', () => ({
          layer: 'legacy',
        }))
      )
    ).toContain('invalid-authority-layer');
    expect(
      authorityCodes(
        authorityMapWith('surface.marketing-routes', () => ({
          owns: [],
        }))
      )
    ).toContain('missing-owned-capability');
    expect(
      authorityCodes(
        authorityMapWith('surface.marketing-routes', entry => ({
          owns: [...entry.owns, entry.owns[0]],
        }))
      )
    ).toContain('duplicate-owned-capability');
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', entry => ({
          owns: [...entry.owns, 'button'],
        }))
      )
    ).toContain('duplicate-owned-capability');
    expect(
      authorityCodes(
        authorityMapWith('surface.marketing-routes', entry => ({
          owns: [...entry.owns, `${entry.owns[0]} `],
        }))
      )
    ).toContain('missing-owned-capability');
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', entry => ({
          owns: [...entry.owns, 'button '],
        }))
      )
    ).toContain('duplicate-owned-capability');
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', () => ({
          dependsOn: ['surface.product-routes'],
        }))
      )
    ).toContain('invalid-dependency-order');
  });

  it('RED: rejects unowned gaps and stale or non-executable evidence', () => {
    expect(
      authorityCodes(
        authorityMapWith('surface.marketing-routes', () => ({
          currentOwners: [],
        }))
      )
    ).toContain('missing-current-owner');
    expect(
      authorityCodes(
        authorityMapWith('surface.marketing-routes', entry => ({
          canonicalSources: [...entry.canonicalSources, 'missing/source.ts'],
        }))
      )
    ).toContain('invalid-repo-path');
    expect(
      authorityCodes(
        authorityMapWith('surface.marketing-routes', () => ({
          canonicalSources: ['apps/web'],
        }))
      )
    ).toContain('invalid-repo-path');
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', () => ({
          executableChecks: ['scripts'],
        }))
      )
    ).toContain('invalid-repo-path');
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', () => ({
          executableChecks: ['README.md'],
        }))
      )
    ).toContain('invalid-authority-check-path');
  });
});
