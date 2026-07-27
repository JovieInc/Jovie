import { describe, expect, it } from 'vitest';
import { resolveStartEntryHandoff } from './start-entry-handoff';

describe('resolveStartEntryHandoff', () => {
  it('accepts and sanitizes an explicit starter prompt', () => {
    expect(
      resolveStartEntryHandoff({
        starter_prompt: '  Plan\u0000 my next release.  ',
      })
    ).toEqual({
      kind: 'prompt',
      prompt: 'Plan my next release.',
    });
  });

  it('retains only canonical Spotify artist context', () => {
    expect(
      resolveStartEntryHandoff({
        artist_name: '  Fictional Artist ',
        spotify_url:
          'open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we?si=tracking',
        starter_prompt: 'Show me this artist.',
      })
    ).toEqual({
      artistName: 'Fictional Artist',
      kind: 'spotify_artist',
      prompt: 'Show me this artist.',
      spotifyUrl: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
    });
  });

  it.each([
    { spotify_url: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we' },
    { url: 'https://example.com/artist' },
    { arbitrary: 'Plan my release' },
    { starter_prompt: ['Plan my release'] },
    { starter_prompt: '\u0000 \u001F' },
  ])('falls back to blank entry for unsupported params: %o', params => {
    expect(resolveStartEntryHandoff(params)).toBeNull();
  });

  it('drops unsafe Spotify context without dropping a valid prompt', () => {
    expect(
      resolveStartEntryHandoff({
        artist_name: 'Fictional Artist',
        spotify_url: 'https://127.0.0.1/artist/private',
        starter_prompt: 'Help me find my artist profile.',
      })
    ).toEqual({
      kind: 'prompt',
      prompt: 'Help me find my artist profile.',
    });
  });
});
