import {
  APP_ROUTES,
  buildSpotifyCatalogConnectionRoute,
} from '@/constants/routes';
import { getConnectorDefinitions } from '@/lib/connectors/registry';
import type { ConnectorDefinition } from '@/lib/connectors/types';
import { DSP_REGISTRY, type DspRegistryEntry } from '@/lib/dsp-registry';

export const INTEGRATION_CATEGORIES = [
  'all',
  'music',
  'productivity',
  'video',
  'metadata',
] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];
export type IntegrationCapability =
  | 'catalog_links'
  | 'artist_import'
  | 'account_sync';

/** A provider can have both public catalog and authenticated account connections. */
export interface IntegrationDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: Exclude<IntegrationCategory, 'all'>;
  readonly aliases: readonly string[];
  readonly capabilities: readonly IntegrationCapability[];
  readonly catalog: DspRegistryEntry | null;
  readonly account: ConnectorDefinition | null;
  readonly setup: { readonly label: string; readonly href: string };
}

/** Compose domain owners; never copy their provider lists into UI or marketing data. */
export function buildIntegrationCatalog(
  dsps: readonly DspRegistryEntry[],
  connectors: readonly ConnectorDefinition[]
): readonly IntegrationDefinition[] {
  const entries = new Map<string, IntegrationDefinition>();
  for (const dsp of dsps) {
    if (entries.has(dsp.key)) throw new Error(`Duplicate DSP: ${dsp.key}`);
    const spotify = dsp.key === 'spotify';
    entries.set(dsp.key, {
      id: dsp.key,
      name: dsp.name,
      description: spotify
        ? 'Connect your artist catalog and import releases from Spotify.'
        : `Match ${dsp.name} links to your music through catalog enrichment.`,
      category:
        dsp.category === 'streaming'
          ? 'music'
          : dsp.category === 'metadata'
            ? 'metadata'
            : 'video',
      aliases: [...dsp.aliases, dsp.musicfetchService],
      capabilities: spotify
        ? ['catalog_links', 'artist_import']
        : ['catalog_links'],
      catalog: dsp,
      account: null,
      setup: spotify
        ? {
            label: 'Connect Artist Catalog',
            href: buildSpotifyCatalogConnectionRoute(),
          }
        : { label: 'Manage Music Links', href: APP_ROUTES.RELEASES },
    });
  }
  const accountIds = new Set<string>();
  for (const account of connectors) {
    if (accountIds.has(account.id))
      throw new Error(`Duplicate account connector: ${account.id}`);
    accountIds.add(account.id);
    const previous = entries.get(account.id);
    entries.set(account.id, {
      id: account.id,
      name: account.label,
      description: account.description,
      category: account.id === 'youtube' ? 'video' : 'productivity',
      aliases: previous?.aliases ?? [],
      capabilities: [...(previous?.capabilities ?? []), 'account_sync'],
      catalog: previous?.catalog ?? null,
      account,
      setup: {
        label: 'Connect Account',
        href:
          account.id === 'youtube'
            ? APP_ROUTES.LIBRARY
            : APP_ROUTES.SETTINGS_CONNECTORS,
      },
    });
  }
  return [...entries.values()];
}

export const INTEGRATION_CATALOG = buildIntegrationCatalog(
  DSP_REGISTRY,
  getConnectorDefinitions()
);

const comparable = (value: string) =>
  value.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

/** Exact aliases only: a demand for "Spotify royalties" must not resolve to catalog import. */
export function findIntegration(
  value: string
): IntegrationDefinition | undefined {
  const key = comparable(value);
  if (!key) return undefined;
  return INTEGRATION_CATALOG.find(entry =>
    [entry.id, entry.name, ...entry.aliases].some(
      alias => comparable(alias) === key
    )
  );
}

export function filterIntegrations(
  query: string,
  category: IntegrationCategory = 'all'
) {
  const term = query.trim().toLowerCase();
  return INTEGRATION_CATALOG.filter(
    entry =>
      (category === 'all' || entry.category === category) &&
      [entry.name, entry.description, ...entry.aliases].some(value =>
        value.toLowerCase().includes(term)
      )
  );
}
