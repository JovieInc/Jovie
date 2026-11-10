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
  it('reports setup-unavailable for each missing credential without promising a retry', () => {
    // Absent OAuth setup is not transient: retrying later cannot fix a missing
    // credential, so the user-facing reason must not imply it can.
    credentials.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
    let state = getConnectorAvailability();
    expect(state.gmail.available).toBe(false);
    expect(state.gmail.reason).toBeTruthy();
    expect(state.gmail.reason).not.toMatch(/try again later/i);
    expect(state.youtube.reason).not.toMatch(/try again later/i);

    credentials.GOOGLE_OAUTH_CLIENT_ID = 'id';
    credentials.GOOGLE_OAUTH_CLIENT_SECRET = '';
    state = getConnectorAvailability();
    expect(state.gmail.available).toBe(false);
    expect(state.gmail.reason).not.toMatch(/try again later/i);
    expect(state.youtube.reason).not.toMatch(/try again later/i);

    credentials.SPOTIFY_CLIENT_ID = 'id';
    state = getConnectorAvailability();
    expect(state.spotify.available).toBe(false);
    expect(state.spotify.reason).not.toMatch(/try again later/i);

    credentials.SPOTIFY_CLIENT_SECRET = 'secret';
    expect(getConnectorAvailability().spotify.available).toBe(true);
  });
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
