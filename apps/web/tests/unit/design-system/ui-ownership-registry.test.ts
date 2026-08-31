import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_RECIPE_REGISTRY,
} from '@/data/appScreens';
import {
  DESIGN_SYSTEM_AUTHORITY_MAP,
  DESIGN_SYSTEM_AUTHORITY_MAP_SCHEMA,
  type DesignSystemAuthorityMap,
  INTERACTION_FAMILY_IDS,
  INTERACTION_REGISTRY,
  INTERACTION_REGISTRY_SCHEMA,
  type InteractionRegistryEntry,
  loadProductionSwiftSources,
  UI_OWNERSHIP_ENTRY_IDS,
  UI_OWNERSHIP_PLATFORMS,
  UI_OWNERSHIP_REGISTRY,
  UI_OWNERSHIP_REGISTRY_SCHEMA,
  UI_OWNERSHIP_STATES,
  UI_OWNERSHIP_SURFACES,
  type UINativeSwiftSource,
  type UIOwnershipRegistryEntry,
  validateDesignSystemAuthorityMap,
  validateInteractionRegistry,
  validateUIOwnershipRegistry,
} from '@/data/designSystem';

type Entry = UIOwnershipRegistryEntry;
const root = path.resolve(__dirname, '../../../../..');
const productionSwiftSources = loadProductionSwiftSources(root);
const codes = (entries: readonly Entry[]) =>
  validateUIOwnershipRegistry({
    entries,
    swiftSources: productionSwiftSources,
    repoRoot: root,
  }).map(issue => issue.code);
const mutate = (id: string, change: (entry: Entry) => Partial<Entry>) =>
  UI_OWNERSHIP_REGISTRY.map(entry =>
    entry.id === id ? { ...entry, ...change(entry) } : entry
  ) as readonly Entry[];
const item = (id: Entry['id']) =>
  UI_OWNERSHIP_REGISTRY.find(entry => entry.id === id) as Entry;
const expectIssue = (entries: readonly Entry[], code: string) =>
  expect(codes(entries)).toContain(code);
const nativeFixture = (
  filename: string,
  productionPath: string
): UINativeSwiftSource => ({
  path: productionPath,
  source: fs.readFileSync(
    path.join(__dirname, 'fixtures/native-ui-ownership', filename),
    'utf8'
  ),
});
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
const authorityIssues = (map: DesignSystemAuthorityMap) =>
  validateDesignSystemAuthorityMap({ map, repoRoot: root });

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

  it('RED: rejects advisory-only enforcement, reverse edges, and unowned gaps', () => {
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', () => ({
          executableChecks: [],
        }))
      )
    ).toContain('missing-authority-check');
    expect(
      authorityCodes(
        authorityMapWith('surface.marketing-routes', () => ({
          owns: [],
        }))
      )
    ).toContain('missing-owned-capability');
    expect(
      authorityCodes(
        authorityMapWith('interaction.families', () => ({
          dependsOn: ['surface.product-routes'],
        }))
      )
    ).toContain('invalid-dependency-order');
    const unorderedMarketingMap: DesignSystemAuthorityMap = {
      ...DESIGN_SYSTEM_AUTHORITY_MAP,
      entries: DESIGN_SYSTEM_AUTHORITY_MAP.entries.map(entry =>
        entry.id === 'surface.marketing-routes'
          ? { ...entry, id: 'surface.marketing-routes-unordered' }
          : entry
      ),
    };
    expect(
      authorityIssues(unorderedMarketingMap).filter(
        issue =>
          issue.code === 'missing-authority-entry' &&
          issue.id === 'surface.marketing-routes-unordered'
      )
    ).toHaveLength(1);
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
  });
});

describe('cross-surface UI ownership registry', () => {
  it('is source-backed, closed-world, and complete', () => {
    expect(UI_OWNERSHIP_REGISTRY_SCHEMA).toBe('jovie.ui-ownership/v1');
    expect(UI_OWNERSHIP_REGISTRY.map(entry => entry.id)).toEqual(
      UI_OWNERSHIP_ENTRY_IDS
    );
    expect(
      validateUIOwnershipRegistry({
        swiftSources: productionSwiftSources,
        repoRoot: root,
      })
    ).toEqual([]);
    expect(new Set(UI_OWNERSHIP_STATES).size).toBe(UI_OWNERSHIP_STATES.length);
    expect(
      UI_OWNERSHIP_SURFACES.every(surface =>
        UI_OWNERSHIP_REGISTRY.some(entry => entry.surfaces.includes(surface))
      )
    ).toBe(true);
    expect(
      UI_OWNERSHIP_PLATFORMS.every(platform =>
        UI_OWNERSHIP_REGISTRY.every(entry =>
          entry.platformAdapters.some(adapter => adapter.platform === platform)
        )
      )
    ).toBe(true);
    for (const entry of UI_OWNERSHIP_REGISTRY) {
      expect(entry.sourcePaths).toContain(entry.canonicalOwner.sourcePath);
      for (const sourcePath of [
        ...entry.sourcePaths,
        ...entry.platformAdapters.flatMap(adapter => adapter.sourcePaths),
      ]) {
        expect(sourcePath).not.toContain('.pen');
        expect(fs.existsSync(path.join(root, sourcePath))).toBe(true);
      }
    }
    expect(item('organism.app-shell-frame').surfaceElevation).toEqual({
      page: 'canvas',
      sidebar: 'canvas',
      main: 'panel',
    });
    expect(item('molecule.profile-primary-cta').visibleControlGeometry).toEqual(
      { visiblePx: 32, hitTargetPx: 44, appliesTo: 'marketing-control' }
    );
    const iconButton = item('atom.icon-button');
    expect(iconButton.sourceAuthority).toEqual({
      registry: 'design-system',
      id: 'atom.icon-button',
    });
    expect(iconButton.canonicalOwner).toEqual({
      sourcePath: 'packages/ui/atoms/icon-button.tsx',
      exportName: 'IconButton',
      registryId: 'atom.icon-button',
    });
    expect(iconButton.duplicateAliases).toEqual(
      expect.arrayContaining(['OverflowMenuTrigger', 'RailToggleButton'])
    );
    expect(iconButton.requiredStates).toContain('pressed');
    const nativeButtonBindings = item('atom.button').platformAdapters.find(
      adapter => adapter.platform === 'ios'
    )?.nativeBindings;
    const nativeIconBindings = iconButton.platformAdapters.find(
      adapter => adapter.platform === 'ios'
    )?.nativeBindings;
    expect(nativeButtonBindings).toMatchObject([
      {
        sourcePath: 'apps/ios/Jovie/DesignSystem/JovieTheme.swift',
        swiftType: 'JoviePillButtonStyle',
        semanticRole: 'pill-action',
        testEvidence: ['apps/ios/JovieTests/AppShellTabBarTests.swift'],
      },
      {
        sourcePath: 'apps/ios/Jovie/DesignSystem/JovieTheme.swift',
        swiftType: 'JoviePressFeedbackButtonStyle',
        semanticRole: 'plain-content-press-feedback',
        testEvidence: ['apps/ios/JovieTests/AppShellTabBarTests.swift'],
      },
    ]);
    expect(nativeIconBindings).toMatchObject([
      {
        sourcePath: 'apps/ios/Jovie/DesignSystem/JovieTheme.swift',
        swiftType: 'JovieIconButtonStyle',
        semanticRole: 'icon-action',
        testEvidence: ['apps/ios/JovieTests/AppShellTabBarTests.swift'],
      },
    ]);
  });

  it('resolves authenticated recipes and ownership to one content-panel owner', () => {
    const registeredOwner = APP_SCREEN_COMPONENT_REGISTRY.find(
      entry => entry.id === 'component.app-shell-content-panel'
    );
    const ownershipEntry = item('organism.app-shell-content-panel');

    expect(registeredOwner).toMatchObject({
      source: 'apps/web/components/organisms/AppShellContentPanel.tsx',
      storybookTitle: 'Organisms/AppShellContentPanel',
    });
    expect(ownershipEntry.sourceAuthority).toEqual({
      registry: 'app-screens',
      id: registeredOwner?.id,
    });
    expect(ownershipEntry.canonicalOwner).toEqual({
      sourcePath: registeredOwner?.source,
      exportName: 'AppShellContentPanel',
      registryId: registeredOwner?.id,
    });
    expect(ownershipEntry.duplicateAliases).toContain('PageShell');

    const contentRecipes = APP_SCREEN_RECIPE_REGISTRY.filter(recipe =>
      recipe.componentIds.includes('component.app-shell-content-panel')
    );
    expect(contentRecipes.map(recipe => recipe.id)).toEqual([
      'recipe.app-standard',
      'recipe.app-settings',
      'recipe.app-operator',
    ]);
    expect(
      APP_SCREEN_COMPONENT_REGISTRY.some(component =>
        component.source.endsWith('/PageShell.tsx')
      )
    ).toBe(false);
  });

  it('certifies the revenue-loop families as direct adaptive owners', () => {
    const expected = [
      {
        id: 'molecule.claim-banner',
        sourcePath: 'apps/web/components/features/profile/ClaimBanner.tsx',
        exportName: 'ClaimBanner',
        surfaces: ['public-profile'],
        states: ['default', 'focus-visible', 'disabled', 'error'],
        adaptiveModes: { compact: 'stacked', medium: 'inline', wide: 'inline' },
      },
      {
        id: 'organism.opportunity-row',
        sourcePath:
          'apps/web/components/organisms/opportunity-card/OpportunityRow.tsx',
        exportName: 'OpportunityRow',
        surfaces: ['app', 'chat'],
        states: [
          'default',
          'hover',
          'focus-visible',
          'selected',
          'disabled',
          'loading',
        ],
        adaptiveModes: {
          compact: 'swipe-enabled',
          medium: 'action-row',
          wide: 'action-row',
        },
      },
      {
        id: 'organism.jovie-work-feed',
        sourcePath:
          'apps/web/components/features/dashboard/organisms/jovie-work-feed/JovieWorkFeed.tsx',
        exportName: 'JovieWorkFeed',
        surfaces: ['app'],
        states: [
          'default',
          'loading',
          'empty',
          'partial',
          'success',
          'error',
          'recovery',
        ],
        adaptiveModes: {
          compact: 'single-column',
          medium: 'single-column',
          wide: 'single-column',
        },
      },
      {
        id: 'organism.standalone-product-page',
        sourcePath: 'apps/web/components/organisms/StandaloneProductPage.tsx',
        exportName: 'StandaloneProductPage',
        surfaces: [
          'app',
          'admin',
          'marketing',
          'auth',
          'onboarding',
          'waitlist',
          'public-profile',
          'chat',
          'calendar',
        ],
        states: ['default', 'loading', 'error'],
        adaptiveModes: {
          compact: 'compact-gutter',
          medium: 'contained',
          wide: 'contained',
        },
      },
    ] as const;

    for (const contract of expected) {
      const entry = item(contract.id);
      expect(entry).toMatchObject({
        id: contract.id,
        sourceAuthority: { registry: 'direct', id: null },
        canonicalOwner: {
          sourcePath: contract.sourcePath,
          exportName: contract.exportName,
          registryId: null,
        },
        surfaces: contract.surfaces,
        states: contract.states,
        requiredStates: contract.states,
        adaptiveModes: contract.adaptiveModes,
        pen: {
          status: 'unresolved',
          identity: null,
          sourceBacked: true,
          evidencePaths: [],
        },
      });
    }

    const claimBanner = item('molecule.claim-banner');
    expectIssue(
      mutate('organism.opportunity-row', () => ({
        canonicalOwner: { ...claimBanner.canonicalOwner },
      })),
      'duplicate-owner'
    );
  });

  it('fails closed on duplicate ownership, source paths, and aliases', () => {
    const [first, second] = UI_OWNERSHIP_REGISTRY;
    expectIssue(
      mutate(second.id, () => ({
        canonicalOwner: { ...first.canonicalOwner },
      })),
      'duplicate-owner'
    );
    expectIssue(
      mutate(second.id, () => ({ sourcePaths: [...first.sourcePaths] })),
      'duplicate-source-path'
    );
    expectIssue(
      mutate(second.id, () => ({
        duplicateAliases: [first.duplicateAliases[0]],
      })),
      'duplicate-alias'
    );
  });

  it('fails closed on missing required states and adapters', () => {
    const button = item('atom.button');
    expectIssue(
      mutate(button.id, entry => ({
        states: entry.states.filter(state => state !== 'loading'),
      })),
      'missing-required-state'
    );
    expectIssue(
      mutate(button.id, entry => ({
        platformAdapters: entry.platformAdapters.map(adapter =>
          adapter.platform === 'ios'
            ? { ...adapter, status: 'implemented', sourcePaths: [] }
            : adapter
        ),
      })),
      'missing-platform-adapter'
    );
  });

  it('RED: rejects a detached native pill-style consumer', () => {
    const swiftSources = [
      ...productionSwiftSources,
      nativeFixture(
        'detached-pill-consumer.swift',
        'apps/ios/Jovie/Features/DetachedPillConsumer.swift'
      ),
    ];

    expect(
      validateUIOwnershipRegistry({
        entries: UI_OWNERSHIP_REGISTRY,
        swiftSources,
      }).map(issue => issue.code)
    ).toContain('detached-native-consumer');

    const indirectConsumer = {
      path: 'apps/ios/Jovie/Features/IndirectPillConsumer.swift',
      source:
        'private let sharedStyle = JoviePillButtonStyle(filled: true)\nstruct IndirectPillConsumer: View { var body: some View { Button("Detached") {}.buttonStyle(sharedStyle) } }',
    };
    expect(
      validateUIOwnershipRegistry({
        entries: UI_OWNERSHIP_REGISTRY,
        swiftSources: [...productionSwiftSources, indirectConsumer],
        repoRoot: root,
      }).map(issue => issue.code)
    ).toContain('detached-native-consumer');
  });

  it('RED: rejects a duplicate Settings-style native family owner', () => {
    const swiftSources = [
      ...productionSwiftSources,
      nativeFixture(
        'duplicate-settings-style-owner.swift',
        'apps/ios/Jovie/Features/Settings/DuplicateSettingsStyleOwner.swift'
      ),
    ];

    expect(
      validateUIOwnershipRegistry({
        entries: UI_OWNERSHIP_REGISTRY,
        swiftSources,
      }).map(issue => issue.code)
    ).toContain('duplicate-native-family-owner');
  });

  it('RED: rejects registered native owners whose press recipe drifts', () => {
    const owner = productionSwiftSources.find(source =>
      source.path.endsWith('/JovieTheme.swift')
    );
    expect(owner).toBeDefined();
    const mutations = [
      [
        '.opacity(configuration.isPressed ? JoviePillButtonStyle.pressedOpacity : 1)',
        '.opacity(1)',
      ],
      [
        '.scaleEffect(configuration.isPressed ? JovieMotion.pressScale : 1)',
        '.scaleEffect(1)',
      ],
      [
        '.animation(JovieMotion.subtle, value: configuration.isPressed)',
        '.animation(nil, value: configuration.isPressed)',
      ],
    ] as const;

    for (const [current, drifted] of mutations) {
      const swiftSources = productionSwiftSources.map(source => {
        if (source.path !== owner?.path) return source;
        let mutated = source.source.replace(current, drifted);
        if (current.includes('JoviePillButtonStyle.pressedOpacity')) {
          mutated = mutated.replace(
            '\n}\n\nstruct JovieIconButtonStyle',
            '\n\n  private func unusedRecipe(configuration: Configuration) -> some View {\n    configuration.label\n      .opacity(configuration.isPressed ? JoviePillButtonStyle.pressedOpacity : 1)\n      .scaleEffect(configuration.isPressed ? JovieMotion.pressScale : 1)\n      .animation(JovieMotion.subtle, value: configuration.isPressed)\n  }\n}\n\nstruct JovieIconButtonStyle'
          );
        }
        return { ...source, source: mutated };
      });
      expect(
        validateUIOwnershipRegistry({
          entries: UI_OWNERSHIP_REGISTRY,
          swiftSources,
          repoRoot: root,
        }).map(issue => issue.code)
      ).toContain('invalid-native-owner-recipe');
    }
  });

  it('fails closed on unregistered reusable native styles and missing tests', () => {
    const swiftSources = [
      ...productionSwiftSources,
      {
        path: 'apps/ios/Jovie/DesignSystem/UnregisteredButtonStyle.swift',
        source:
          'struct UnregisteredButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label } }',
      },
    ];
    expect(
      validateUIOwnershipRegistry({
        entries: UI_OWNERSHIP_REGISTRY,
        swiftSources,
      }).map(issue => issue.code)
    ).toContain('unregistered-reusable-native-style');

    const withoutTests = mutate('atom.button', entry => ({
      platformAdapters: entry.platformAdapters.map(adapter => ({
        ...adapter,
        nativeBindings: adapter.nativeBindings?.map(binding => ({
          ...binding,
          testEvidence: [],
        })),
      })),
    }));
    expectIssue(withoutTests, 'missing-native-test');

    const duplicateRegisteredRole = mutate('atom.icon-button', entry => ({
      platformAdapters: entry.platformAdapters.map(adapter => ({
        ...adapter,
        nativeBindings: adapter.nativeBindings?.map(binding => ({
          ...binding,
          semanticRole: 'pill-action',
        })),
      })),
    }));
    expectIssue(duplicateRegisteredRole, 'duplicate-native-family-owner');

    const swappedRoles = UI_OWNERSHIP_REGISTRY.map(entry => ({
      ...entry,
      platformAdapters: entry.platformAdapters.map(adapter => ({
        ...adapter,
        nativeBindings: adapter.nativeBindings?.map(binding => ({
          ...binding,
          semanticRole:
            binding.swiftType === 'JoviePillButtonStyle'
              ? ('icon-action' as const)
              : binding.swiftType === 'JovieIconButtonStyle'
                ? ('pill-action' as const)
                : binding.semanticRole,
        })),
      })),
    })) as readonly Entry[];
    expectIssue(swappedRoles, 'missing-native-binding');

    const withoutNativeBindings = UI_OWNERSHIP_REGISTRY.map(entry => ({
      ...entry,
      platformAdapters: entry.platformAdapters.map(adapter => ({
        ...adapter,
        nativeBindings:
          entry.id === 'atom.button' || entry.id === 'atom.icon-button'
            ? undefined
            : adapter.nativeBindings,
      })),
    })) as readonly Entry[];
    expectIssue(withoutNativeBindings, 'missing-native-binding');

    const productionFileAsTest = mutate('atom.icon-button', entry => ({
      platformAdapters: entry.platformAdapters.map(adapter => ({
        ...adapter,
        nativeBindings: adapter.nativeBindings?.map(binding => ({
          ...binding,
          testEvidence: ['apps/ios/Jovie/DesignSystem/JovieTheme.swift'],
        })),
      })),
    }));
    expectIssue(productionFileAsTest, 'missing-native-test');

    const irrelevantNativeTargetTest = mutate('atom.icon-button', entry => ({
      platformAdapters: entry.platformAdapters.map(adapter => ({
        ...adapter,
        nativeBindings: adapter.nativeBindings?.map(binding => ({
          ...binding,
          testEvidence: ['apps/ios/JovieTests/APIClientTests.swift'],
        })),
      })),
    }));
    expectIssue(irrelevantNativeTargetTest, 'missing-native-test');
  });

  it('RED: recognizes alternate reusable Swift ButtonStyle declarations', () => {
    const alternateDeclarations = [
      '@MainActor public struct ExportedButtonStyle: SwiftUI.ButtonStyle, Sendable { func makeBody(configuration: Configuration) -> some View { configuration.label } }',
      'package struct GenericButtonStyle<Value>: Sendable, ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label } }',
      'extension ExtendedButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label } }',
      'open class ReferenceButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label } }',
      'enum ChoiceButtonStyle: ButtonStyle { case standard; func makeBody(configuration: Configuration) -> some View { configuration.label } }',
      'struct TriggerButtonStyle: PrimitiveButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label } }',
    ];

    for (const [index, source] of alternateDeclarations.entries()) {
      const issues = validateUIOwnershipRegistry({
        entries: UI_OWNERSHIP_REGISTRY,
        swiftSources: [
          ...productionSwiftSources,
          {
            path: `apps/ios/Jovie/DesignSystem/Alternate${index}.swift`,
            source,
          },
        ],
        repoRoot: root,
      });
      expect(issues.map(issue => issue.code)).toContain(
        'unregistered-reusable-native-style'
      );
    }
  });

  it('ignores ButtonStyle examples inside Swift comments and string literals', () => {
    const swiftSources = [
      ...productionSwiftSources,
      nativeFixture(
        'non-code-button-style-examples.swift',
        'apps/ios/Jovie/Features/NonCodeButtonStyleExamples.swift'
      ),
    ];
    const issues = validateUIOwnershipRegistry({
      entries: UI_OWNERSHIP_REGISTRY,
      swiftSources,
      repoRoot: root,
    });

    expect(
      issues.filter(issue =>
        issue.id.includes('NonCodeButtonStyleExamples.swift')
      )
    ).toEqual([]);
  });

  it('fails closed on serif policy and Pen proposal/canonical confusion', () => {
    expectIssue(
      mutate('organism.marketing-header', entry => ({
        typography: {
          ...entry.typography,
          family: 'Georgia',
        } as Entry['typography'],
      })),
      'unregistered-serif'
    );
    expectIssue(
      mutate('organism.marketing-header', entry => ({
        typography: {
          ...entry.typography,
          serifException: {
            kind: 'media',
            sourcePath: 'proposal.pen',
            owner: '',
            reason: '',
          },
        },
      })),
      'unregistered-serif'
    );
    expectIssue(
      mutate('atom.button', entry => ({
        pen: { ...entry.pen, identity: null, sourceBacked: false },
      })),
      'pen-status-conflict'
    );
    expectIssue(
      mutate('atom.link', entry => ({
        pen: {
          ...entry.pen,
          status: 'proposal',
          sourceBacked: true,
          identity: 'proposal:link',
          reason: undefined,
        } as Entry['pen'],
      })),
      'pen-status-conflict'
    );
  });
});

describe('interaction ownership layer', () => {
  const interactionCodes = (entries: readonly InteractionRegistryEntry[]) =>
    validateInteractionRegistry({ entries, repoRoot: root }).map(
      issue => issue.code
    );
  const mutateInteraction = (
    id: InteractionRegistryEntry['id'],
    change: (
      entry: InteractionRegistryEntry
    ) => Partial<InteractionRegistryEntry>
  ) =>
    INTERACTION_REGISTRY.map(entry =>
      entry.id === id ? { ...entry, ...change(entry) } : entry
    ) as readonly InteractionRegistryEntry[];

  it('registers exactly twelve source-backed interaction families', () => {
    const projected = UI_OWNERSHIP_REGISTRY.filter(
      entry => entry.layer === 'interaction'
    );
    expect(INTERACTION_REGISTRY_SCHEMA).toBe('jovie.interaction-ownership/v1');
    expect(INTERACTION_REGISTRY.map(entry => entry.id)).toEqual(
      INTERACTION_FAMILY_IDS
    );
    expect(INTERACTION_REGISTRY).toHaveLength(12);
    expect(projected.map(entry => entry.id)).toEqual(INTERACTION_FAMILY_IDS);
    expect(validateInteractionRegistry({ repoRoot: root })).toEqual([]);

    for (const entry of projected) {
      expect(entry.sourceAuthority).toEqual({
        registry: 'interactions',
        id: entry.id,
      });
      expect(entry.canonicalOwner.registryId).toBe(entry.id);
      expect(entry.interaction).toMatchObject({
        role: entry.id.replace('interaction.', ''),
      });
      expect(entry.interaction?.storySource).toMatch(/\.stories\.tsx$/);
      expect(entry.interaction?.testSources.length).toBeGreaterThan(0);
      expect(entry.adaptiveModes.compact).toBeTruthy();
      expect(entry.adaptiveModes.medium).toBeTruthy();
      expect(entry.adaptiveModes.wide).toBeTruthy();
    }
  });

  it('RED: rejects missing families, duplicate roles, and duplicate owners', () => {
    expect(interactionCodes(INTERACTION_REGISTRY.slice(1))).toContain(
      'missing-interaction-family'
    );

    const [menu, tooltip] = INTERACTION_REGISTRY;
    expect(menu).toBeDefined();
    expect(tooltip).toBeDefined();
    expect(
      interactionCodes(
        mutateInteraction(tooltip.id, () => ({ role: menu.role }))
      )
    ).toEqual(
      expect.arrayContaining([
        'duplicate-interaction-role',
        'invalid-interaction-id',
      ])
    );
    expect(
      interactionCodes(
        mutateInteraction(tooltip.id, () => ({ owner: { ...menu.owner } }))
      )
    ).toContain('duplicate-interaction-owner');
    expectIssue(
      UI_OWNERSHIP_REGISTRY.filter(entry => entry.id !== 'interaction.menu'),
      'missing-interaction-family'
    );
  });

  it('RED: rejects missing rendered and behavior evidence', () => {
    expect(
      interactionCodes(
        mutateInteraction('interaction.toast', () => ({ storySource: '' }))
      )
    ).toContain('missing-story-evidence');
    expect(
      interactionCodes(
        mutateInteraction('interaction.banner', () => ({ testSources: [] }))
      )
    ).toContain('missing-test-evidence');
    expect(
      interactionCodes(
        mutateInteraction('interaction.search', () => ({
          testSources: ['apps/web/components/molecules/missing.test.tsx'],
        }))
      )
    ).toContain('missing-test-evidence');
    expectIssue(
      mutate('interaction.toast', entry => ({
        interaction: { ...entry.interaction, storySource: '' },
      })),
      'missing-story-evidence'
    );
  });

  it('RED: rejects unsupported contract values and duplicate aliases', () => {
    const invalidValues = [
      ['geometry', 'invalid-geometry-mode'],
      ['focus', 'invalid-focus-policy'],
      ['keyboard', 'invalid-keyboard-policy'],
      ['dismissal', 'invalid-dismissal-policy'],
      ['motion', 'invalid-motion-intent'],
      ['reducedMotion', 'invalid-reduced-motion-policy'],
    ] as const;

    for (const [key, expectedCode] of invalidValues) {
      expect(
        interactionCodes(
          mutateInteraction('interaction.dialog', () => ({
            [key]: 'route-local',
          }))
        )
      ).toContain(expectedCode);
    }

    const menuAlias = INTERACTION_REGISTRY[0]?.duplicateAliases[0];
    expect(menuAlias).toBeDefined();
    expect(
      interactionCodes(
        mutateInteraction('interaction.tooltip', () => ({
          duplicateAliases: [menuAlias as string],
        }))
      )
    ).toContain('duplicate-alias');
  });
});
