import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_RECIPE_REGISTRY,
} from '@/data/appScreens';
import {
  loadProductionSwiftSources,
  UI_OWNERSHIP_ENTRY_IDS,
  UI_OWNERSHIP_PLATFORMS,
  UI_OWNERSHIP_REGISTRY,
  UI_OWNERSHIP_REGISTRY_SCHEMA,
  UI_OWNERSHIP_STATES,
  UI_OWNERSHIP_SURFACES,
  type UINativeSwiftSource,
  type UIOwnershipRegistryEntry,
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
