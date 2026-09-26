import {
  BUTTON_PEN_CONTRACT,
  BUTTON_SIZE_NAMES,
  BUTTON_VARIANT_NAMES,
  type ButtonPenMaster,
  type ButtonPenVariantKey,
  ICON_BUTTON_SIZE_NAMES,
  ICON_BUTTON_VARIANT_NAMES,
} from '@jovie/ui';

export const DESIGN_SYSTEM_COMPONENT_IDS = [
  'atom.button',
  'atom.input',
  'atom.separator',
  'atom.switch',
  'atom.sheet',
  'atom.kbd',
  'atom.icon-button',
  'atom.link',
  'atom.brand-logo',
  'atom.logo',
  'atom.logo-link',
] as const;

export type DesignSystemComponentId =
  (typeof DESIGN_SYSTEM_COMPONENT_IDS)[number];

export type DesignSystemLayer = 'atom' | 'molecule' | 'organism';

export interface DesignSystemCompatibilityConsumer {
  readonly source: string;
  readonly exportName: string;
  readonly canonicalImportSource: string;
}

export interface DesignSystemComponentRegistryEntry {
  readonly id: DesignSystemComponentId;
  readonly layer: DesignSystemLayer;
  readonly source: string;
  readonly exportName: string;
  readonly contractSource?: string;
  readonly storySource?: string;
  readonly storybookTitle?: string;
  readonly storyExport?: string;
  readonly testSources: readonly string[];
  readonly dependsOn: readonly DesignSystemComponentId[];
  readonly compatibilityConsumers: readonly DesignSystemCompatibilityConsumer[];
  readonly penRootId: string | null;
  /**
   * Executable Pen family for components whose visual selections resolve to
   * explicit per-selection masters. Every mapped root is part of this same
   * component identity, never a second component.
   */
  readonly penRootByVariantKey?: Readonly<
    Partial<Record<ButtonPenVariantKey, ButtonPenMaster>>
  >;
  readonly referenceEligible: boolean;
  readonly penIdentityReason?: string;
  readonly variantAxes: Readonly<Record<string, readonly string[]>>;
}

/**
 * Canonical source graph for shared public atoms. This registry is separate
 * from marketing and authenticated-screen registries so package ownership
 * stays intact.
 */
export const DESIGN_SYSTEM_COMPONENT_REGISTRY = [
  {
    id: 'atom.button',
    layer: 'atom',
    source: 'packages/ui/atoms/button.tsx',
    exportName: 'Button',
    contractSource: 'packages/ui/atoms/button-contract.ts',
    storySource: 'packages/ui/atoms/button.stories.tsx',
    storybookTitle: 'shadcn/Button',
    storyExport: 'Primary',
    testSources: ['packages/ui/atoms/button.test.tsx'],
    dependsOn: [],
    compatibilityConsumers: [],
    penRootId: null,
    penRootByVariantKey: BUTTON_PEN_CONTRACT.rootByVariantKey,
    referenceEligible: true,
    variantAxes: {
      destructive: ['false', 'true'],
      variant: BUTTON_VARIANT_NAMES,
      size: BUTTON_SIZE_NAMES,
    },
  },
  {
    id: 'atom.input',
    layer: 'atom',
    source: 'packages/ui/atoms/input.tsx',
    exportName: 'Input',
    storySource: 'packages/ui/atoms/input.stories.tsx',
    storybookTitle: 'UI/Atoms/Input',
    storyExport: 'ConformanceMatrix',
    testSources: ['packages/ui/atoms/input.test.tsx'],
    dependsOn: [],
    compatibilityConsumers: [],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No committed canonical Pen save/readback export maps an Input root; source binding remains authoritative until Pen promotion.',
    variantAxes: {
      inputSize: ['sm', 'md', 'lg'],
      state: [
        'default',
        'focus-visible',
        'disabled',
        'error',
        'success',
        'loading',
        'pending',
        'long-placeholder',
      ],
      type: ['text', 'password', 'search', 'number'],
    },
  },
  {
    id: 'atom.separator',
    layer: 'atom',
    source: 'packages/ui/atoms/separator.tsx',
    exportName: 'Separator',
    storySource: 'packages/ui/atoms/separator.stories.tsx',
    storybookTitle: 'UI/Atoms/Separator',
    storyExport: 'ConformanceMatrix',
    testSources: [
      'apps/web/tests/e2e/storybook-separator.spec.ts',
      'packages/ui/atoms/separator.test.tsx',
    ],
    dependsOn: [],
    compatibilityConsumers: [],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen separator root exists; source ownership remains authoritative until Pen promotion.',
    variantAxes: {
      orientation: ['horizontal', 'vertical'],
      decorative: ['true', 'false'],
    },
  },
  {
    id: 'atom.switch',
    layer: 'atom',
    source: 'packages/ui/atoms/switch.tsx',
    exportName: 'Switch',
    storySource: 'packages/ui/atoms/switch.stories.tsx',
    storybookTitle: 'UI/Atoms/Switch',
    storyExport: 'ConformanceMatrix',
    testSources: ['packages/ui/atoms/switch.test.tsx'],
    dependsOn: [],
    compatibilityConsumers: [],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen switch root exists; source ownership remains authoritative until Pen promotion.',
    variantAxes: {
      state: ['unchecked', 'checked', 'focus-visible', 'disabled', 'invalid'],
      presentation: ['default', 'feature-thumb'],
    },
  },
  {
    id: 'atom.sheet',
    layer: 'atom',
    source: 'packages/ui/atoms/sheet.tsx',
    exportName: 'Sheet',
    storySource: 'packages/ui/atoms/sheet.stories.tsx',
    storybookTitle: 'UI/Atoms/Sheet',
    storyExport: 'ConformanceMatrix',
    testSources: [
      'apps/web/tests/e2e/storybook-sheet.spec.ts',
      'packages/ui/atoms/sheet.test.tsx',
    ],
    dependsOn: [],
    compatibilityConsumers: [
      {
        source: 'apps/web/app/app/(shell)/library/ArtistRulesSheet.tsx',
        exportName: 'ArtistRulesSheet',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source: 'apps/web/app/app/(shell)/library/LibrarySurface.tsx',
        exportName: 'LibrarySurface',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source: 'apps/web/components/features/release/ReleaseCreditsDialog.tsx',
        exportName: 'ReleaseCreditsDialog',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source:
          'apps/web/components/jovie/release-calendar/ReleaseMomentDrawer.tsx',
        exportName: 'ReleaseMomentDrawer',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source: 'apps/web/components/organisms/CookieModal.tsx',
        exportName: 'CookieModal',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source:
          'apps/web/components/organisms/keyboard-shortcuts-sheet/KeyboardShortcutsSheet.tsx',
        exportName: 'KeyboardShortcutsSheet',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source: 'apps/web/components/organisms/sidebar/sidebar.tsx',
        exportName: 'Sidebar',
        canonicalImportSource: '@jovie/ui',
      },
    ],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen Sheet root exists; source ownership remains authoritative until Pen promotion.',
    variantAxes: {
      side: ['top', 'bottom', 'left', 'right'],
      rendering: ['portal', 'inline'],
      state: ['closed', 'open', 'controlled'],
      interaction: ['trigger', 'close-button', 'escape', 'outside-click'],
      viewport: ['desktop', 'compact'],
      theme: ['light', 'dark'],
      motion: ['default', 'reduced'],
    },
  },
  {
    id: 'atom.kbd',
    layer: 'atom',
    source: 'packages/ui/atoms/kbd.tsx',
    exportName: 'Kbd',
    storySource: 'packages/ui/atoms/kbd.stories.tsx',
    storybookTitle: 'UI/Atoms/Kbd',
    storyExport: 'ShortcutSequence',
    testSources: ['packages/ui/atoms/kbd.test.tsx'],
    dependsOn: [],
    compatibilityConsumers: [],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen Kbd root exists; source ownership remains authoritative until Pen promotion.',
    variantAxes: {
      variant: ['default', 'tooltip'],
    },
  },
  {
    id: 'atom.icon-button',
    layer: 'atom',
    source: 'packages/ui/atoms/icon-button.tsx',
    exportName: 'IconButton',
    contractSource: 'packages/ui/atoms/icon-button-contract.ts',
    storySource: 'packages/ui/atoms/icon-button.stories.tsx',
    storybookTitle: 'shadcn/IconButton',
    storyExport: 'Ghost',
    testSources: ['packages/ui/atoms/icon-button.test.tsx'],
    dependsOn: ['atom.button'],
    compatibilityConsumers: [
      {
        source: 'apps/web/components/atoms/AppIconButton.tsx',
        exportName: 'AppIconButton',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source: 'apps/web/components/atoms/CircleIconButton.tsx',
        exportName: 'CircleIconButton',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source: 'apps/web/components/atoms/HeaderIconButton.tsx',
        exportName: 'HeaderIconButton',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source: 'apps/web/components/atoms/InlineIconButton.tsx',
        exportName: 'InlineIconButton',
        canonicalImportSource: '@jovie/ui',
      },
      {
        source: 'packages/ui/atoms/overflow-menu-trigger.tsx',
        exportName: 'OverflowMenuTrigger',
        canonicalImportSource: './icon-button',
      },
      {
        source: 'apps/web/components/atoms/RailToggleButton.tsx',
        exportName: 'RailToggleButton',
        canonicalImportSource: '@jovie/ui',
      },
    ],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen icon-button root exists; source ownership remains authoritative until Pen promotion.',
    variantAxes: {
      variant: ICON_BUTTON_VARIANT_NAMES,
      size: ICON_BUTTON_SIZE_NAMES,
      state: [
        'default',
        'hover',
        'focus-visible',
        'pressed',
        'disabled',
        'loading',
      ],
    },
  },
  {
    id: 'atom.link',
    layer: 'atom',
    source: 'packages/ui/atoms/link.tsx',
    exportName: 'Link',
    storySource: 'packages/ui/atoms/link.stories.tsx',
    storybookTitle: 'shadcn/Link',
    storyExport: 'Default',
    testSources: ['packages/ui/atoms/link.test.tsx'],
    dependsOn: [],
    compatibilityConsumers: [],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen atom root exists; keep raw until Pen promotion.',
    variantAxes: {
      variant: ['default', 'subtle', 'inline'],
      state: ['idle', 'active', 'visited', 'disabled'],
    },
  },
  {
    id: 'atom.brand-logo',
    layer: 'atom',
    source: 'apps/web/components/atoms/BrandLogo.tsx',
    exportName: 'BrandLogo',
    storySource: 'apps/web/components/atoms/BrandLogo.stories.tsx',
    storybookTitle: 'Atoms/BrandLogo',
    storyExport: 'Default',
    testSources: ['apps/web/tests/unit/atoms/BrandLogo.test.tsx'],
    dependsOn: [],
    compatibilityConsumers: [],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen brand atom root exists; keep raw until Pen promotion.',
    variantAxes: {
      variant: ['jovie', 'ov'],
      tone: ['auto', 'white', 'color', 'muted'],
      rounded: ['true', 'false'],
      size: ['numeric'],
    },
  },
  {
    id: 'atom.logo',
    layer: 'atom',
    source: 'apps/web/components/atoms/Logo.tsx',
    exportName: 'Logo',
    storySource: 'apps/web/components/atoms/Logo.stories.tsx',
    storybookTitle: 'Atoms/Logo',
    storyExport: 'Default',
    testSources: ['apps/web/tests/unit/Logo.test.tsx'],
    dependsOn: ['atom.brand-logo'],
    compatibilityConsumers: [],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen logo atom root exists; keep raw until Pen promotion.',
    variantAxes: {
      variant: ['word', 'wordAlt', 'icon', 'full', 'fullAlt'],
      size: ['xs', 'sm', 'md', 'lg', 'xl'],
      tone: ['auto', 'white', 'color', 'muted'],
    },
  },
  {
    id: 'atom.logo-link',
    layer: 'atom',
    source: 'apps/web/components/atoms/LogoLink.tsx',
    exportName: 'LogoLink',
    storySource: 'apps/web/components/atoms/LogoLink.stories.tsx',
    storybookTitle: 'Atoms/LogoLink',
    storyExport: 'Default',
    testSources: ['apps/web/tests/unit/LogoLink.test.tsx'],
    dependsOn: ['atom.logo'],
    compatibilityConsumers: [],
    penRootId: null,
    referenceEligible: false,
    penIdentityReason:
      'No source-mapped Pen logo-link root exists; normalize its Logo dependency after promotion.',
    variantAxes: {
      variant: ['word', 'wordAlt', 'icon', 'full', 'fullAlt'],
      logoSize: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
  },
] as const satisfies readonly DesignSystemComponentRegistryEntry[];

const COMPONENT_BY_ID = new Map<
  DesignSystemComponentId,
  DesignSystemComponentRegistryEntry
>(DESIGN_SYSTEM_COMPONENT_REGISTRY.map(component => [component.id, component]));

export function getDesignSystemComponent(
  id: DesignSystemComponentId
): DesignSystemComponentRegistryEntry | null {
  return COMPONENT_BY_ID.get(id) ?? null;
}

/** Unique source-backed Pen root for a design-system entry, or null. */
export function designSystemCanonicalPenRoot(
  entry: DesignSystemComponentRegistryEntry
): string | null {
  if (entry.penRootId) return entry.penRootId;
  const familyRoots = [
    ...new Set(
      Object.values(entry.penRootByVariantKey ?? {}).map(
        master => master.rootId
      )
    ),
  ];
  return familyRoots.length === 1 ? familyRoots[0] : null;
}

export function designSystemVariantKey(
  id: DesignSystemComponentId,
  selection: Readonly<Record<string, string>>
): string {
  const component = getDesignSystemComponent(id);
  if (!component) throw new Error(`Unknown design-system component: ${id}`);

  const axes = Object.entries(component.variantAxes).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const expectedAxes = new Set(axes.map(([axis]) => axis));
  const unknownAxis = Object.keys(selection).find(
    axis => !expectedAxes.has(axis)
  );
  if (unknownAxis) {
    throw new Error(`Unsupported ${id} axis: ${unknownAxis}`);
  }
  const parts = axes.map(([axis, values]) => {
    const value = selection[axis];
    if (!value || !values.includes(value)) {
      throw new Error(`Unsupported ${id} ${axis}: ${value ?? '<missing>'}`);
    }
    return `${axis}=${value}`;
  });

  return `${id}|${parts.join('|')}`;
}

export type DesignSystemRegistryIssueCode =
  | 'duplicate-component-id'
  | 'duplicate-compatibility-consumer'
  | 'invalid-compatibility-consumer'
  | 'detached-canonical-consumer'
  | 'duplicate-pen-root'
  | 'missing-dependency'
  | 'missing-source-evidence'
  | 'reference-without-pen-root'
  | 'unresolved-pen-identity-without-reason';

export interface DesignSystemRegistryIssue {
  readonly code: DesignSystemRegistryIssueCode;
  readonly id: string;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Source-level admission check for a declared compatibility API. Metadata is
 * insufficient: the consumer must import and render the canonical owner.
 */
export function validateDesignSystemCompatibilityConsumerSource(
  entry: DesignSystemComponentRegistryEntry,
  consumer: DesignSystemCompatibilityConsumer,
  sourceText: string
): readonly DesignSystemRegistryIssue[] {
  const owner = escapeRegExp(entry.exportName);
  const importSource = escapeRegExp(consumer.canonicalImportSource);
  const importsOwner = new RegExp(
    `import\\s*\\{[^}]*\\b${owner}\\b[^}]*\\}\\s*from\\s*['"]${importSource}['"]`,
    'm'
  ).test(sourceText);
  const rendersOwner = new RegExp(`<${owner}(?:\\s|>)`, 'm').test(sourceText);

  return importsOwner && rendersOwner
    ? []
    : [
        {
          code: 'detached-canonical-consumer',
          id: `${entry.id}:${consumer.exportName}`,
        },
      ];
}

export function validateDesignSystemComponentRegistry(
  entries: readonly DesignSystemComponentRegistryEntry[] = DESIGN_SYSTEM_COMPONENT_REGISTRY
): readonly DesignSystemRegistryIssue[] {
  const issues: DesignSystemRegistryIssue[] = [];
  const ids = new Set<string>();
  const roots = new Set<string>();
  const consumers = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) {
      issues.push({ code: 'duplicate-component-id', id: entry.id });
    }
    ids.add(entry.id);

    for (const consumer of entry.compatibilityConsumers) {
      const consumerKey = `${consumer.source}::${consumer.exportName}`;
      if (consumers.has(consumerKey)) {
        issues.push({
          code: 'duplicate-compatibility-consumer',
          id: consumerKey,
        });
      }
      consumers.add(consumerKey);
      if (
        !consumer.source ||
        !consumer.exportName ||
        !consumer.canonicalImportSource ||
        consumer.source.includes('.pen')
      ) {
        issues.push({
          code: 'invalid-compatibility-consumer',
          id: consumerKey,
        });
      }
    }

    if (
      !entry.source ||
      !entry.exportName ||
      !entry.storySource ||
      !entry.storybookTitle ||
      !entry.storyExport ||
      entry.testSources.length === 0
    ) {
      issues.push({ code: 'missing-source-evidence', id: entry.id });
    }
    if (
      entry.referenceEligible &&
      !entry.penRootId &&
      Object.keys(entry.penRootByVariantKey ?? {}).length === 0
    ) {
      issues.push({ code: 'reference-without-pen-root', id: entry.id });
    }
    if (!entry.referenceEligible && !entry.penIdentityReason) {
      issues.push({
        code: 'unresolved-pen-identity-without-reason',
        id: entry.id,
      });
    }
    const entryRoots = [
      ...(entry.penRootId ? [entry.penRootId] : []),
      ...Object.values(entry.penRootByVariantKey ?? {}).map(
        master => master.rootId
      ),
    ];
    for (const root of entryRoots) {
      if (roots.has(root)) {
        issues.push({ code: 'duplicate-pen-root', id: entry.id });
      }
      roots.add(root);
    }
  }

  for (const entry of entries) {
    for (const dependency of entry.dependsOn) {
      if (!ids.has(dependency)) {
        issues.push({ code: 'missing-dependency', id: entry.id });
      }
    }
  }

  return issues;
}
