import { describe, expect, it } from 'vitest';
import { parseAgentArtistInput } from './artist-input';

const ID = '4Z8W4fKeB5YxbusRsdQVPb';

describe('agent artist identity input', () => {
  it('normalizes exact Spotify identities without forwarding arbitrary URLs', () => {
    for (const input of [
      ID,
      `spotify:${ID}`,
      `spotify:artist:${ID}`,
      `https://open.spotify.com/artist/${ID}?si=tracking#fragment`,
      `https://open.spotify.com/intl-de/artist/${ID}/`,
    ]) {
      expect(parseAgentArtistInput({ input })).toEqual({
        kind: 'exact',
        provider: 'spotify',
        id: ID,
      });
    }
  });

  it('preserves Apple storefront while requiring exact numeric identity', () => {
    expect(
      parseAgentArtistInput({
        input: 'https://music.apple.com/gb/artist/radiohead/657515',
      })
    ).toEqual({
      kind: 'exact',
      provider: 'apple_music',
      id: '657515',
      storefront: 'gb',
    });
    expect(
      parseAgentArtistInput({
        input: 'https://music.apple.com/us/artist/657515/',
      })
    ).toMatchObject({
      kind: 'exact',
      id: '657515',
      storefront: 'us',
    });
    for (const input of ['apple_music:657515', 'apple_music:artist:657515']) {
      expect(parseAgentArtistInput({ input })).toEqual({
        kind: 'exact',
        provider: 'apple_music',
        id: '657515',
      });
    }
    expect(
      parseAgentArtistInput({ input: '657515', provider: 'apple_music' })
    ).toMatchObject({ kind: 'exact' });
    expect(parseAgentArtistInput({ input: '1975' })).toEqual({
      kind: 'search',
      provider: 'spotify',
      query: '1975',
    });
  });

  it('keeps real names as search requests, including ambiguous punctuation', () => {
    for (const input of [' Tim White ', 'AC/DC', 'Björk']) {
      expect(parseAgentArtistInput({ input })).toEqual({
        kind: 'search',
        provider: 'spotify',
        query: input.trim(),
      });
    }
    expect(
      parseAgentArtistInput({ input: 'The National', provider: 'apple_music' })
    ).toEqual({
      kind: 'search',
      provider: 'apple_music',
      query: 'The National',
    });
  });

  it('rejects mismatched provider identities and malformed direct IDs', () => {
    for (const value of [
      { input: `spotify:${ID}`, provider: 'apple_music' },
      {
        input: `https://open.spotify.com/artist/${ID}`,
        provider: 'apple_music',
      },
      { input: 'apple_music:abc' },
      { input: 'apple_music:0' },
      { input: 'spotify:bad' },
      { input: 'spotify:artist:bad' },
    ])
      expect(parseAgentArtistInput(value).kind).toBe('invalid');
  });

  it('rejects SSRF, credentials, unsupported resources and disguised URLs', () => {
    const credentialed = new URL(`https://open.spotify.com/artist/${ID}`);
    credentialed.username = 'test-user';
    credentialed.password = 'fixture-only';
    for (const input of [
      `http://open.spotify.com/artist/${ID}`,
      `https://open.spotify.com:444/artist/${ID}`,
      credentialed.href,
      `https://open.spotify.com.evil.example/artist/${ID}`,
      `https://open.spotify.com/track/${ID}`,
      `https://open.spotify.com/artist/${ID}/related`,
      'https://music.apple.com/us/album/radiohead/657515',
      'https://127.0.0.1/artist/123',
      'file:///etc/passwd',
      '//open.spotify.com/artist/123',
      'https:%%',
      'open.spotify.com/artist/123',
      'www.evil.example',
    ])
      expect(parseAgentArtistInput({ input }).kind, input).toBe('invalid');
  });

  it('bounds untrusted input and disallows ownership or publication fields', () => {
    for (const value of [
      null,
      {},
      { input: 42 },
      { input: '' },
      { input: 'a'.repeat(501) },
      { input: 'a '.repeat(40) },
      { input: 'artist\u0000name' },
      { input: 'Tim', publish: true },
      { input: 'Tim', owner_id: 'private' },
      { input: 'Tim', provider: 'unknown' },
    ])
      expect(parseAgentArtistInput(value).kind).toBe('invalid');
  });
});
