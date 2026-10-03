import { describe, expect, it } from 'vitest';
import {
  APP_ROUTES,
  buildSpotifyCatalogConnectionRoute,
} from '@/constants/routes';
import { getConnectorDefinitions } from '@/lib/connectors/registry';
import { DSP_REGISTRY } from '@/lib/dsp-registry';
import {
  buildIntegrationCatalog,
  filterIntegrations,
  findIntegration,
  INTEGRATION_CATALOG,
} from './catalog';

describe('integration catalog parity', () => {
  it('includes every domain provider exactly once, merging YouTube modes', () => {
    const ids = new Set([
      ...DSP_REGISTRY.map(p => p.key),
      ...getConnectorDefinitions().map(p => p.id),
    ]);
    expect(INTEGRATION_CATALOG.map(p => p.id).sort()).toEqual([...ids].sort());
    expect(findIntegration('youtube')?.capabilities).toEqual([
      'catalog_links',
      'account_sync',
    ]);
    for (const provider of getConnectorDefinitions())
      expect(findIntegration(provider.id)?.account).toBe(provider);
  });
  it('routes Spotify to the existing catalog connection without claiming account OAuth', () => {
    expect(findIntegration('Spotify')).toMatchObject({
      account: null,
      capabilities: ['catalog_links', 'artist_import'],
      setup: { href: buildSpotifyCatalogConnectionRoute() },
    });
    expect(findIntegration('Apple Music')).toMatchObject({
      account: null,
      capabilities: ['catalog_links'],
      setup: { href: APP_ROUTES.RELEASES },
    });
  });
  it('resolves exact aliases and refuses misleading substring matches', () => {
    expect(findIntegration('itunes')?.id).toBe('apple_music');
    expect(findIntegration('Spotify royalties')).toBeUndefined();
    expect(findIntegration('')).toBeUndefined();
    expect(findIntegration('new service')).toBeUndefined();
  });
  it('intersects search and category filters, including aliases and empty results', () => {
    expect(filterIntegrations(' iTunes ', 'music').map(p => p.id)).toEqual([
      'apple_music',
    ]);
    expect(filterIntegrations('gmail', 'music')).toEqual([]);
    expect(filterIntegrations('gmail', 'productivity').map(p => p.id)).toEqual([
      'gmail',
    ]);
    expect(filterIntegrations('')).toHaveLength(INTEGRATION_CATALOG.length);
  });
  it('adds new domain definitions without a second marketing registration', () => {
    const first = DSP_REGISTRY[0];
    const catalog = buildIntegrationCatalog(
      [{ ...first, key: 'new_service', name: 'New Service' }],
      []
    );
    expect(catalog[0]).toMatchObject({
      id: 'new_service',
      name: 'New Service',
      account: null,
    });
  });
  it('rejects duplicate source entries instead of silently overwriting', () => {
    expect(() =>
      buildIntegrationCatalog([DSP_REGISTRY[0], DSP_REGISTRY[0]], [])
    ).toThrow('Duplicate DSP');
    const first = getConnectorDefinitions()[0];
    expect(() => buildIntegrationCatalog([], [first, first])).toThrow(
      'Duplicate account connector'
    );
  });
});
