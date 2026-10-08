import { describe, expect, it } from 'vitest';
import {
  getAdvertisedConnectorIntegrations,
  getGrantedConnectorCapabilities,
} from './capabilities';
import { getConnectorDefinition, getConnectorDefinitions } from './registry';
import type {
  ConnectorAvailability,
  ConnectorDefinition,
  ConnectorProviderId,
} from './types';

const available = Object.fromEntries(
  getConnectorDefinitions().map(definition => [
    definition.id,
    { available: true },
  ])
) as Record<ConnectorProviderId, ConnectorAvailability>;

describe('connector capability access and advertising', () => {
  it('distinguishes read grants from write approval and completed operations', () => {
    const youtube = getConnectorDefinition('youtube');
    const capabilities = getGrantedConnectorCapabilities(youtube, 'connected', [
      youtube.oauthScopes[0],
    ]);
    expect(capabilities.map(capability => capability.id)).toEqual([
      'channel_videos.read',
    ]);
    expect(
      getGrantedConnectorCapabilities(youtube, 'connected', youtube.oauthScopes)
    ).toHaveLength(4);
    for (const capability of youtube.capabilities.filter(
      capability => capability.mode === 'write'
    )) {
      expect(capability.requiresApproval).toBe(true);
    }
  });
  it.each([
    'not_connected',
    'disabled',
    'needs_reauth',
    'error',
    'unavailable',
  ] as const)('revokes operation access when connection is %s', status => {
    const definition = getConnectorDefinition('google_calendar');
    expect(
      getGrantedConnectorCapabilities(
        definition,
        status,
        definition.oauthScopes
      )
    ).toEqual([]);
  });
  it('requires every permission for a multi-scope operation', () => {
    const spotify = getConnectorDefinition('spotify');
    expect(
      getGrantedConnectorCapabilities(spotify, 'syncing', [
        'playlist-read-private',
        'playlist-modify-public',
      ]).map(capability => capability.id)
    ).toEqual(['playlists.read']);
  });
  it('filters planned and blocked capabilities even if all permissions were granted', () => {
    const base = getConnectorDefinition('gmail');
    const definition: ConnectorDefinition = {
      ...base,
      capabilities: base.capabilities.map(capability => ({
        ...capability,
        availability: 'blocked',
      })),
    };
    expect(
      getGrantedConnectorCapabilities(
        definition,
        'connected',
        definition.oauthScopes
      )
    ).toEqual([]);
  });
  it('advertises only configured providers and implemented operations supported on the platform', () => {
    const projection = getAdvertisedConnectorIntegrations({
      ...available,
      youtube: { available: false },
    });
    expect(projection.map(provider => provider.id)).toEqual([
      'gmail',
      'google_calendar',
      'spotify',
    ]);
    expect(getAdvertisedConnectorIntegrations(available, 'ios')).toEqual([]);
    for (const provider of projection) {
      expect(provider.capabilities).toEqual(
        getConnectorDefinition(provider.id).capabilities.filter(
          capability => capability.availability === 'available'
        )
      );
      expect(provider).not.toHaveProperty('oauthScopes');
    }
    expect(getAdvertisedConnectorIntegrations(available, 'mac')).toHaveLength(
      4
    );
  });
  it('keeps capabilities scoped to permissions the actual OAuth connector requests', () => {
    const ids = new Set<string>();
    for (const provider of getConnectorDefinitions()) {
      for (const capability of provider.capabilities) {
        expect(ids.has(capability.id)).toBe(false);
        ids.add(capability.id);
        expect(capability.requiredScopes.length).toBeGreaterThan(0);
        expect(
          capability.requiredScopes.every(scope =>
            provider.oauthScopes.includes(scope)
          )
        ).toBe(true);
        if (capability.mode === 'write')
          expect(capability.requiresApproval).toBe(true);
      }
    }
  });
});
