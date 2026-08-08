/** Server-safe canonical projection of marketing shells, sections, and variants. */

import {
  MARKETING_SECTIONS,
  type MarketingSectionId,
  type MarketingVariant,
} from './sections';

export type MarketingRegistryKind = 'shell' | 'section';

export interface MarketingShellRegistryEntry {
  readonly id: `shell.${string}`;
  readonly kind: 'shell';
  readonly source: string;
  readonly storybookTitle: `Marketing/Shells/${string}`;
}

export interface MarketingSectionRegistryEntry {
  readonly id: `section.${MarketingSectionId}`;
  readonly kind: 'section';
  readonly sectionId: MarketingSectionId;
  readonly source: string;
  readonly storybookTitle: `Marketing/Sections/${MarketingSectionId}`;
  readonly variants: readonly MarketingVariant['id'][];
  readonly defaultVariant: string;
  readonly maxPerComposition?: number;
}

export type MarketingRegistryEntry =
  | MarketingShellRegistryEntry
  | MarketingSectionRegistryEntry;

const shell = (
  id: MarketingShellRegistryEntry['id'],
  source: string,
  storybookTitle: MarketingShellRegistryEntry['storybookTitle']
): MarketingShellRegistryEntry => ({
  id,
  kind: 'shell',
  source,
  storybookTitle,
});

export const MARKETING_SHELL_REGISTRY = [
  shell(
    'shell.public-page',
    'apps/web/components/site/PublicPageShell',
    'Marketing/Shells/PublicPageShell'
  ),
  shell(
    'shell.header',
    'apps/web/components/site/MarketingHeader',
    'Marketing/Shells/MarketingHeader'
  ),
  shell(
    'shell.footer',
    'apps/web/components/site/MarketingFooter',
    'Marketing/Shells/MarketingFooter'
  ),
  shell(
    'shell.page',
    'apps/web/components/marketing/MarketingPageShell',
    'Marketing/Shells/MarketingPageShell'
  ),
  shell(
    'shell.container',
    'apps/web/components/marketing/MarketingContainer',
    'Marketing/Shells/MarketingContainer/page'
  ),
  shell(
    'shell.prose',
    'apps/web/components/marketing/MarketingContentShell',
    'Marketing/Shells/MarketingContainer/prose'
  ),
] as const satisfies readonly MarketingShellRegistryEntry[];

/** Section taxonomy and legal variants remain sourced from `sections.ts`. */
export const MARKETING_SECTION_REGISTRY: readonly MarketingSectionRegistryEntry[] =
  MARKETING_SECTIONS.map(section => ({
    id: `section.${section.id}` as const,
    kind: 'section' as const,
    sectionId: section.id,
    source: section.component,
    storybookTitle: `Marketing/Sections/${section.id}` as const,
    variants: section.variants.map(variant => variant.id),
    defaultVariant: section.defaultVariant,
    ...(section.id === 'hero' ? { maxPerComposition: 1 } : {}),
  }));

export const MARKETING_COMPONENT_REGISTRY: readonly MarketingRegistryEntry[] = [
  ...MARKETING_SHELL_REGISTRY,
  ...MARKETING_SECTION_REGISTRY,
];

export const MARKETING_COMPOSITION_CONTRACT = {
  shell: 'shell.public-page',
  hero: { sectionId: 'hero', exactly: 1, first: true },
  sections: {
    source: 'MARKETING_SECTION_REGISTRY',
    unregisteredAllowed: false,
  },
} as const;

const REGISTRY_BY_ID: Readonly<Record<string, MarketingRegistryEntry>> =
  Object.fromEntries(
    MARKETING_COMPONENT_REGISTRY.map(entry => [entry.id, entry])
  );

export function getMarketingRegistryEntry(
  id: string
): MarketingRegistryEntry | null {
  return REGISTRY_BY_ID[id] ?? null;
}

export function getMarketingSectionRegistryEntry(
  sectionId: string
): MarketingSectionRegistryEntry | null {
  const entry = getMarketingRegistryEntry(`section.${sectionId}`);
  return entry?.kind === 'section' ? entry : null;
}
