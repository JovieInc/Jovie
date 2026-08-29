import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_ARCHETYPE_IDS,
  APP_SCREEN_ARCHETYPE_RECEIPT_SCHEMA,
  APP_SCREEN_ARCHETYPE_REGISTRY,
  APP_SCREEN_REGISTRY,
  type AppScreenArchetypeRegistryEntry,
  assembleAppScreen,
  buildAppScreenArchetypeReceipt,
  DESIGN_REFERENCE_ARCHETYPE_BY_ROUTE,
  getAppScreenArchetype,
  validateAppScreenAssembly,
  validateAppScreenSystem,
} from '@/data/appScreens';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const slotsFor = (archetype: AppScreenArchetypeRegistryEntry) =>
  Object.fromEntries(
    archetype.requiredSlots.map(slot => [slot, slot])
  ) as Parameters<typeof assembleAppScreen>[0]['slots'];
const codes = (issues: readonly { readonly code: string }[]) =>
  issues.map(issue => issue.code);

describe('authenticated app screen product archetypes', () => {
  it('registers eight archetypes, maps every design reference, and certifies HEAD', () => {
    expect([...APP_SCREEN_ARCHETYPE_IDS]).toEqual([
      'dashboard',
      'detail',
      'editor',
      'settings',
      'feed-list',
      'onboarding',
      'profile',
      'opportunity-decision',
    ]);
    expect(validateAppScreenSystem()).toEqual([]);
    const references = APP_SCREEN_REGISTRY.filter(
      entry => entry.designReference
    );
    expect(Object.keys(DESIGN_REFERENCE_ARCHETYPE_BY_ROUTE).sort()).toEqual(
      references.map(entry => entry.route).sort()
    );
    for (const archetype of APP_SCREEN_ARCHETYPE_REGISTRY) {
      const assembled = assembleAppScreen({
        archetypeId: archetype.id,
        slots: slotsFor(archetype),
      });
      expect(assembled.recipeId).toBe(archetype.recipeId);
      if (archetype.representativeScreenId) {
        const screen = APP_SCREEN_REGISTRY.find(
          entry => entry.id === archetype.representativeScreenId
        );
        expect(screen?.story?.id).toBe(archetype.representativeStoryId);
      } else {
        expect(archetype.id).toBe('onboarding');
      }
    }
    for (const screen of APP_SCREEN_REGISTRY) {
      if (!screen.designReference) expect(screen.archetypeId).toBeNull();
    }
    const receipt = buildAppScreenArchetypeReceipt({ headSha: HEAD });
    expect(receipt.ok).toBe(true);
    expect(receipt.schema).toBe(APP_SCREEN_ARCHETYPE_RECEIPT_SCHEMA);
    expect(receipt.representatives).toHaveLength(8);
    expect(() => buildAppScreenArchetypeReceipt({ headSha: 'bad' })).toThrow(
      /exact HEAD SHA/
    );
  });

  it('fails closed on missing archetype, wrong recipe, missing slot, and stale story', () => {
    const settings = getAppScreenArchetype(
      'settings'
    ) as AppScreenArchetypeRegistryEntry;
    const dashboard = getAppScreenArchetype(
      'dashboard'
    ) as AppScreenArchetypeRegistryEntry;
    const { primaryAction: omitted, ...incomplete } = slotsFor(dashboard);
    expect(omitted).toBe('primaryAction');
    const alias = APP_SCREEN_REGISTRY.find(entry => entry.kind === 'alias');
    const reference = APP_SCREEN_REGISTRY.find(entry => entry.designReference);

    expect(
      codes(
        validateAppScreenSystem({
          archetypes: APP_SCREEN_ARCHETYPE_REGISTRY.filter(
            entry => entry.id !== 'onboarding'
          ),
        })
      )
    ).toContain('missing-archetype');
    expect(
      codes(validateAppScreenAssembly({ archetypeId: 'missing', slots: {} }))
    ).toContain('missing-archetype');
    expect(
      codes(
        validateAppScreenAssembly({
          archetypeId: 'settings',
          recipeId: 'recipe.app-compatibility',
          slots: slotsFor(settings),
        })
      )
    ).toContain('wrong-recipe');
    expect(
      codes(
        validateAppScreenAssembly({
          archetypeId: 'dashboard',
          slots: incomplete,
        })
      )
    ).toContain('missing-slot');
    expect(
      codes(
        validateAppScreenSystem({
          archetypes: APP_SCREEN_ARCHETYPE_REGISTRY.map(entry =>
            entry.id === 'dashboard'
              ? {
                  ...entry,
                  representativeStoryId: 'app-screens-stale--reference',
                }
              : entry
          ),
        })
      )
    ).toContain('stale-representative-story');
    expect(
      codes(
        validateAppScreenAssembly({
          archetypeId: 'dashboard',
          recipeId: 'recipe.app-standard',
          componentIds: ['component.unified-table'],
          slots: slotsFor(dashboard),
        })
      )
    ).toContain('illegal-recipe-component');
    expect(
      codes(
        validateAppScreenSystem({
          screens: APP_SCREEN_REGISTRY.map(entry =>
            entry.id === alias?.id
              ? { ...entry, archetypeId: 'settings' }
              : entry
          ),
        })
      )
    ).toContain('unexpected-archetype');
    expect(
      codes(
        validateAppScreenSystem({
          screens: APP_SCREEN_REGISTRY.map(entry =>
            entry.id === reference?.id ? { ...entry, archetypeId: null } : entry
          ),
        })
      )
    ).toContain('unmapped-design-reference');
  });
});
