import {
  BUTTON_PEN_CONTRACT,
  BUTTON_SIZE_NAMES,
  BUTTON_VARIANT_NAMES,
} from '@jovie/ui';

export const DESIGN_SYSTEM_COMPONENT_IDS = [
  'atom.button',
  'atom.link',
  'atom.brand-logo',
  'atom.logo',
  'atom.logo-link',
] as const;

export type DesignSystemComponentId =
  (typeof DESIGN_SYSTEM_COMPONENT_IDS)[number];

export type DesignSystemLayer = 'atom' | 'molecule' | 'organism';

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
  readonly penRootId: string | null;
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
    penRootId: BUTTON_PEN_CONTRACT.rootId,
    referenceEligible: true,
    variantAxes: {
      destructive: ['false', 'true'],
      variant: BUTTON_VARIANT_NAMES,
      size: BUTTON_SIZE_NAMES,
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
    storySource: 'apps/web/components/atoms/BrandIdentity.stories.tsx',
    storybookTitle: 'Atoms/BrandIdentity',
    storyExport: 'BrandLogoSource',
    testSources: ['apps/web/tests/unit/atoms/BrandLogo.test.tsx'],
    dependsOn: [],
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
    storySource: 'apps/web/components/atoms/BrandIdentity.stories.tsx',
    storybookTitle: 'Atoms/BrandIdentity',
    storyExport: 'LogoSource',
    testSources: ['apps/web/tests/unit/Logo.test.tsx'],
    dependsOn: ['atom.brand-logo'],
    penRootId: 'EXwUm',
    referenceEligible: false,
    penIdentityReason:
      'Existing Pen logo root is not yet verified as a source-mapped reusable origin.',
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
    storySource: 'apps/web/components/atoms/BrandIdentity.stories.tsx',
    storybookTitle: 'Atoms/BrandIdentity',
    storyExport: 'LogoLinkSource',
    testSources: ['apps/web/tests/unit/LogoLink.test.tsx'],
    dependsOn: ['atom.logo'],
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
  | 'duplicate-pen-root'
  | 'missing-dependency'
  | 'missing-source-evidence'
  | 'reference-without-pen-root'
  | 'unresolved-pen-identity-without-reason';

export interface DesignSystemRegistryIssue {
  readonly code: DesignSystemRegistryIssueCode;
  readonly id: string;
}

export function validateDesignSystemComponentRegistry(
  entries: readonly DesignSystemComponentRegistryEntry[] = DESIGN_SYSTEM_COMPONENT_REGISTRY
): readonly DesignSystemRegistryIssue[] {
  const issues: DesignSystemRegistryIssue[] = [];
  const ids = new Set<string>();
  const roots = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) {
      issues.push({ code: 'duplicate-component-id', id: entry.id });
    }
    ids.add(entry.id);

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
    if (entry.referenceEligible && !entry.penRootId) {
      issues.push({ code: 'reference-without-pen-root', id: entry.id });
    }
    if (!entry.referenceEligible && !entry.penIdentityReason) {
      issues.push({
        code: 'unresolved-pen-identity-without-reason',
        id: entry.id,
      });
    }
    if (entry.penRootId) {
      if (roots.has(entry.penRootId)) {
        issues.push({ code: 'duplicate-pen-root', id: entry.id });
      }
      roots.add(entry.penRootId);
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
