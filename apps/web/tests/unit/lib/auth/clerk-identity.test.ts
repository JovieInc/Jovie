import { describe, expect, it } from 'vitest';

import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';

describe('resolveClerkIdentity', () => {
  it('prefers privateMetadata.fullName over other name sources', () => {
    const identity = resolveClerkIdentity({
      primaryEmailAddress: { emailAddress: 'Test@Example.com' },
      fullName: 'Clerk Full',
      firstName: 'First',
      lastName: 'Last',
      username: 'user123',
      privateMetadata: { fullName: 'Private Full Name' },
    });

    expect(identity.email).toBe('test@example.com');
    expect(identity.displayName).toBe('Private Full Name');
    expect(identity.displayNameSource).toBe('private_metadata_full_name');
    expect(identity.spotifyUsername).toBe(null);
  });

  it('falls back to Clerk fullName when private metadata is absent', () => {
    const identity = resolveClerkIdentity({
      primaryEmailAddress: { emailAddress: 'person@example.com' },
      fullName: 'Clerk Full',
      firstName: 'First',
      lastName: 'Last',
      username: 'user123',
    });

    expect(identity.displayName).toBe('Clerk Full');
    expect(identity.displayNameSource).toBe('clerk_full_name');
  });

  it('falls back to name parts when fullName is absent', () => {
    const identity = resolveClerkIdentity({
      primaryEmailAddress: { emailAddress: 'person@example.com' },
      firstName: 'First',
      lastName: 'Last',
      username: 'user123',
    });

    expect(identity.displayName).toBe('First Last');
    expect(identity.displayNameSource).toBe('clerk_name_parts');
  });

  it('falls back to username when name is absent', () => {
    const identity = resolveClerkIdentity({
      primaryEmailAddress: { emailAddress: 'person@example.com' },
      username: 'user123',
    });

    expect(identity.displayName).toBe('user123');
    expect(identity.displayNameSource).toBe('clerk_username');
  });

  it('falls back to email local part when no other identifiers exist', () => {
    const identity = resolveClerkIdentity({
      primaryEmailAddress: { emailAddress: 'some.person_123@example.com' },
    });

    expect(identity.displayName).toBe('some person 123');
    expect(identity.displayNameSource).toBe('email_local_part');
  });

  it('extracts Spotify username from external accounts', () => {
    const identity = resolveClerkIdentity({
      primaryEmailAddress: { emailAddress: 'person@example.com' },
      externalAccounts: [
        { provider: 'oauth_google', username: 'ignored-google' },
        { provider: 'oauth_spotify', username: 'spotify.artist' },
      ],
    });

    expect(identity.spotifyUsername).toBe('spotify.artist');
  });

  it('returns nulls when user is missing', () => {
    const identity = resolveClerkIdentity(null);

    expect(identity.email).toBe(null);
    expect(identity.displayName).toBe(null);
    expect(identity.avatarUrl).toBe(null);
    expect(identity.spotifyUsername).toBe(null);
    expect(identity.displayNameSource).toBe(null);
  });
});
