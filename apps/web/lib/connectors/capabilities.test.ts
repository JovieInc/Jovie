import { describe, expect, it } from 'vitest';
import {
  getAdvertisedConnectorIntegrations as advertised,
  getGrantedConnectorCapabilities as granted,
} from './capabilities';
import { getConnectorDefinition, getConnectorDefinitions } from './registry';
import type { ConnectorAvailability, ConnectorProviderId } from './types';

const youtube = getConnectorDefinition('youtube');
const available = Object.fromEntries(
  getConnectorDefinitions().map(({ id }) => [id, { available: true }])
) as Record<ConnectorProviderId, ConnectorAvailability>;

describe('connector capability access and advertising', () => {
  it('grants only requested YouTube read permissions', () => {
    const capabilities = granted(youtube, 'connected', [
      youtube.oauthScopes[0],
    ]);
    expect(capabilities.map(item => item.id)).toEqual(['channel_videos.read']);
  });
  it.each([
    'not_connected',
    'disabled',
    'needs_reauth',
    'error',
    'unavailable',
  ] as const)('revokes operation access when connection is %s', status => {
    const definition = getConnectorDefinition('google_calendar');
    expect(granted(definition, status, definition.oauthScopes)).toEqual([]);
  });
  it('requires every permission for a multi-scope operation', () => {
    const spotify = getConnectorDefinition('spotify');
    expect(
      granted(spotify, 'syncing', [
        'playlist-read-private',
        'playlist-modify-public',
      ]).map(capability => capability.id)
    ).toEqual(['playlists.read']);
  });
  it.each(['connected', 'syncing'] as const)(
    'blocks YouTube reply capability despite every OAuth grant (%s)',
    status => {
      const reply = youtube.capabilities.find(
        capability => capability.id === 'comment_replies.write'
      );
      expect(reply?.availability).toBe('blocked');
      const access = granted(youtube, status, youtube.oauthScopes);
      expect(access).not.toContainEqual(reply);
      for (const platform of ['web', 'mac'] as const) {
        const provider = advertised(available, platform).find(
          p => p.id === 'youtube'
        );
        expect(provider?.capabilities).not.toContainEqual(reply);
      }
    }
  );
  it('advertises only configured providers and implemented operations supported on the platform', () => {
    const projection = advertised({
      ...available,
      youtube: { available: false },
    });
    const providerIds = projection.map(provider => provider.id);
    expect(providerIds).toEqual(['gmail', 'google_calendar', 'spotify']);
    expect(advertised(available, 'ios')).toEqual([]);
    for (const provider of projection) {
      expect(provider.capabilities).toEqual(
        getConnectorDefinition(provider.id).capabilities.filter(
          capability => capability.availability === 'available'
        )
      );
      expect(provider).not.toHaveProperty('oauthScopes');
    }
    expect(advertised(available, 'mac')).toHaveLength(4);
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
