import { describe, expect, it } from 'vitest';
import {
  getAdvertisedConnectorIntegrations,
  getGrantedConnectorCapabilities,
} from './capabilities';
import { getConnectorDefinition, getConnectorDefinitions } from './registry';
import type { ConnectorAvailability, ConnectorProviderId } from './types';

const available = Object.fromEntries(
  getConnectorDefinitions().map(({ id }) => [id, { available: true }])
) as Record<ConnectorProviderId, ConnectorAvailability>;

describe('connector capability access and advertising', () => {
  it('grants only requested YouTube read permissions', () => {
    const youtube = getConnectorDefinition('youtube');
    const capabilities = getGrantedConnectorCapabilities(youtube, 'connected', [
      youtube.oauthScopes[0],
    ]);
    expect(capabilities.map(capability => capability.id)).toEqual([
      'channel_videos.read',
    ]);
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
  it.each(['connected', 'syncing'] as const)(
    'blocks YouTube reply capability despite every OAuth grant (%s)',
    status => {
      const definition = getConnectorDefinition('youtube');
      const reply = definition.capabilities.find(
        capability => capability.id === 'comment_replies.write'
      );
      expect(reply?.availability).toBe('blocked');
      expect(
        getGrantedConnectorCapabilities(
          definition,
          status,
          definition.oauthScopes
        )
      ).not.toContainEqual(reply);
      for (const platform of ['web', 'mac'] as const) {
        expect(
          getAdvertisedConnectorIntegrations(available, platform).find(
            provider => provider.id === 'youtube'
          )?.capabilities
        ).not.toContainEqual(reply);
      }
    }
  );
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
