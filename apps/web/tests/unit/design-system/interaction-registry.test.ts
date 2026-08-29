import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INTERACTION_FAMILY_IDS,
  INTERACTION_REGISTRY,
  INTERACTION_REGISTRY_SCHEMA,
  type InteractionRegistryEntry,
  UI_OWNERSHIP_REGISTRY,
  validateInteractionRegistry,
} from '@/data/designSystem';

type Entry = InteractionRegistryEntry;
const root = path.resolve(__dirname, '../../../../..');
const codes = (entries: readonly Entry[]) =>
  validateInteractionRegistry({ entries, repoRoot: root }).map(
    issue => issue.code
  );
const mutate = (id: Entry['id'], change: (entry: Entry) => Partial<Entry>) =>
  INTERACTION_REGISTRY.map(entry =>
    entry.id === id ? { ...entry, ...change(entry) } : entry
  ) as readonly Entry[];

describe('interaction ownership registry', () => {
  it('registers all twelve families with production owners and evidence', () => {
    expect(INTERACTION_REGISTRY_SCHEMA).toBe('jovie.interaction-ownership/v1');
    expect(INTERACTION_REGISTRY.map(entry => entry.id)).toEqual(
      INTERACTION_FAMILY_IDS
    );
    expect(INTERACTION_REGISTRY).toHaveLength(12);
    expect(validateInteractionRegistry({ repoRoot: root })).toEqual([]);

    for (const entry of INTERACTION_REGISTRY) {
      expect(entry.surfaces).toEqual(
        expect.arrayContaining(['app', 'marketing'])
      );
      expect(entry.requiredStates).toEqual(entry.states);
      expect(entry.storySource).toMatch(/\.stories\.tsx$/);
      expect(entry.testSources.length).toBeGreaterThan(0);
      expect(entry.reducedMotion).toBe('preserve-outcome-without-motion');
    }
  });

  it('projects every family into the single cross-surface authority map', () => {
    const projected = UI_OWNERSHIP_REGISTRY.filter(
      entry => entry.layer === 'interaction'
    );

    expect(projected.map(entry => entry.id)).toEqual(INTERACTION_FAMILY_IDS);
    for (const entry of projected) {
      expect(entry.sourceAuthority).toEqual({
        registry: 'interactions',
        id: entry.id,
      });
      expect(entry.canonicalOwner.registryId).toBe(entry.id);
      expect(entry.platformAdapters).toHaveLength(3);
    }
  });

  it('RED: rejects missing families, duplicate roles, and duplicate owners', () => {
    expect(codes(INTERACTION_REGISTRY.slice(1))).toContain(
      'missing-interaction-family'
    );

    const [menu, tooltip] = INTERACTION_REGISTRY;
    expect(menu).toBeDefined();
    expect(tooltip).toBeDefined();
    const duplicateRole = mutate(tooltip.id, () => ({ role: menu.role }));
    expect(codes(duplicateRole)).toEqual(
      expect.arrayContaining([
        'duplicate-interaction-role',
        'invalid-interaction-id',
      ])
    );
    expect(
      codes(mutate(tooltip.id, () => ({ owner: { ...menu.owner } })))
    ).toContain('duplicate-interaction-owner');
  });

  it('RED: rejects missing rendered and behavior evidence', () => {
    expect(
      codes(mutate('interaction.toast', () => ({ storySource: '' })))
    ).toContain('missing-story-evidence');
    expect(
      codes(mutate('interaction.banner', () => ({ testSources: [] })))
    ).toContain('missing-test-evidence');
    expect(
      codes(
        mutate('interaction.search', () => ({
          testSources: ['apps/web/components/molecules/missing.test.tsx'],
        }))
      )
    ).toContain('missing-test-evidence');
  });

  it('RED: rejects unsupported behavior contract values and duplicate aliases', () => {
    const invalidValues = [
      ['geometry', 'invalid-geometry-mode'],
      ['focus', 'invalid-focus-policy'],
      ['keyboard', 'invalid-keyboard-policy'],
      ['dismissal', 'invalid-dismissal-policy'],
      ['motion', 'invalid-motion-intent'],
      ['reducedMotion', 'invalid-reduced-motion-policy'],
    ] as const;

    for (const [key, expectedCode] of invalidValues) {
      const invalid = mutate('interaction.dialog', () => ({
        [key]: 'route-local',
      })) as readonly Entry[];
      expect(codes(invalid)).toContain(expectedCode);
    }

    const menuAlias = INTERACTION_REGISTRY[0]?.duplicateAliases[0];
    expect(menuAlias).toBeDefined();
    expect(
      codes(
        mutate('interaction.tooltip', () => ({
          duplicateAliases: [menuAlias as string],
        }))
      )
    ).toContain('duplicate-alias');
  });
});
