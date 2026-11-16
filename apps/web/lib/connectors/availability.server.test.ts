import { beforeEach, describe, expect, it, vi } from 'vitest';

const { credentials } = vi.hoisted(() => ({
  credentials: {
    GOOGLE_OAUTH_CLIENT_ID: '',
    GOOGLE_OAUTH_CLIENT_SECRET: '',
    SPOTIFY_CLIENT_ID: '',
    SPOTIFY_CLIENT_SECRET: '',
  },
}));
vi.mock('@/lib/env-server', () => ({ env: credentials }));

import { getConnectorAvailability } from './availability.server';
import { getConnectorDefinitions } from './registry';
import type { ConnectorOAuthBundle } from './types';

// The setup-unavailable copy under test: setup-specific, no retry promise.
const SETUP_UNAVAILABLE_REASON =
  'Connection setup is unavailable. This connector cannot be connected yet.';

const MISSING_CREDENTIAL_CASES: ReadonlyArray<{
  readonly bundle: ConnectorOAuthBundle;
  readonly credential: keyof typeof credentials;
  readonly sibling: keyof typeof credentials;
}> = [
  {
    bundle: 'google',
    credential: 'GOOGLE_OAUTH_CLIENT_ID',
    sibling: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },
  {
    bundle: 'google',
    credential: 'GOOGLE_OAUTH_CLIENT_SECRET',
    sibling: 'GOOGLE_OAUTH_CLIENT_ID',
  },
  {
    bundle: 'youtube',
    credential: 'GOOGLE_OAUTH_CLIENT_ID',
    sibling: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },
  {
    bundle: 'youtube',
    credential: 'GOOGLE_OAUTH_CLIENT_SECRET',
    sibling: 'GOOGLE_OAUTH_CLIENT_ID',
  },
  {
    bundle: 'spotify',
    credential: 'SPOTIFY_CLIENT_ID',
    sibling: 'SPOTIFY_CLIENT_SECRET',
  },
  {
    bundle: 'spotify',
    credential: 'SPOTIFY_CLIENT_SECRET',
    sibling: 'SPOTIFY_CLIENT_ID',
  },
];

describe('connector configuration availability', () => {
  beforeEach(() => {
    for (const key of Object.keys(credentials) as (keyof typeof credentials)[])
      credentials[key] = '';
  });
  it('requires both credentials and returns only safe availability, never tokens', () => {
    credentials.GOOGLE_OAUTH_CLIENT_ID = 'id';
    expect(getConnectorAvailability().youtube.available).toBe(false);
    credentials.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
    const state = getConnectorAvailability();
    expect(state.gmail.available).toBe(true);
    expect(state.google_calendar.available).toBe(true);
    expect(state.youtube.available).toBe(true);
    expect(state.spotify.available).toBe(false);
    expect(JSON.stringify(state)).not.toContain('secret');
  });
  it.each(MISSING_CREDENTIAL_CASES)(
    'reports setup-unavailable for the $bundle bundle when $credential alone is missing',
    ({ bundle, credential, sibling }) => {
      // Absent OAuth setup is not transient: retrying later cannot fix a
      // missing credential. Set the bundle's OTHER credential so exactly the
      // named one is missing, then assert the copy for every provider in the
      // bundle as resolved from the real registry.
      expect(credential).not.toBe(sibling);
      credentials[sibling] = 'fixture-value';
      const state = getConnectorAvailability();
      const bundleProviders = getConnectorDefinitions().filter(
        definition => definition.oauthBundle === bundle
      );
      expect(bundleProviders.length).toBeGreaterThan(0);
      for (const definition of bundleProviders) {
        const availability = state[definition.id];
        expect(availability.available).toBe(false);
        // Positive copy assertion: the exact setup-specific message. A
        // negative phrase assertion alone would accept many wrong messages.
        expect(availability.reason).toBe(SETUP_UNAVAILABLE_REASON);
        expect(availability.reason).not.toMatch(/try again later/i);
      }
    }
  );
  it('keeps setup-failure copy distinct from transient read-failure copy and free of secret values', () => {
    credentials.GOOGLE_OAUTH_CLIENT_ID = 'id';
    credentials.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
    const state = getConnectorAvailability();
    expect(state.spotify.available).toBe(false);
    // The transient read-failure fallback rendered by ConnectorCard is allowed
    // to say "try again later"; setup absence must be worded differently.
    expect(state.spotify.reason).not.toBe(
      'Connection is unavailable. Try again later.'
    );
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('secret');
  });
  it('isolates provider bundles without treating a fixture as configured OAuth', () => {
    credentials.SPOTIFY_CLIENT_ID = 'id';
    credentials.SPOTIFY_CLIENT_SECRET = 'secret';
    const state = getConnectorAvailability();
    expect(state.spotify.available).toBe(true);
    expect(state.gmail.available).toBe(false);
    expect(state.gmail.reason).toBeTruthy();
  });
});
