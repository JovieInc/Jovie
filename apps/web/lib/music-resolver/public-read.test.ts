import { describe, expect, it } from 'vitest';
import {
  musicResolveQuery,
  musicResolveSchema,
  resolvePublicMusic,
} from './public-read';

const mbid = '51972833-bb04-46b7-9401-45a5ab449ebd';
describe('public music resolution input', () => {
  it.each([
    [{ input: 'Tim White' }, { kind: 'artist', name: 'Tim White' }],
    [{ input: mbid.toUpperCase() }, { kind: 'artist', mbid }],
    [
      { input: 'https://musicbrainz.org/artist/' + mbid },
      { kind: 'artist', url: 'https://musicbrainz.org/artist/' + mbid },
    ],
    [
      { input: 'us-abc-12-34567', kind: 'track', territory: 'gb' },
      { kind: 'track', isrc: 'USABC1234567', territory: 'GB' },
    ],
    [
      { input: '123456789012', kind: 'album' },
      { kind: 'album', upc: '123456789012' },
    ],
    [
      { input: 'Take Me Over', kind: 'track', artist: 'Tim White' },
      { kind: 'track', title: 'Take Me Over', artist: 'Tim White' },
    ],
    [
      { input: 'Release', kind: 'album', artist: 'Tim White', territory: 'gb' },
      { kind: 'album', title: 'Release', artist: 'Tim White', territory: 'GB' },
    ],
    [
      { input: 'https://music.apple.com/gb/album/release/123', kind: 'album' },
      { kind: 'album', url: 'https://music.apple.com/gb/album/release/123' },
    ],
  ])(
    'maps a bounded input onto the existing resolver: %j',
    (input, expected) => {
      expect(musicResolveQuery(musicResolveSchema.parse(input))).toMatchObject(
        expected
      );
    }
  );

  it.each([
    { input: 'Title', kind: 'track' },
    { input: 'Title', kind: 'album' },
    { input: 'https://example.com:999/artist' },
    { input: 'https://' },
    {
      input: [
        'https://fixture-user',
        ':fixture-password@example.com/artist',
      ].join(''),
    },
    { input: 'http://example.com/artist' },
    { input: 'file:///etc/passwd' },
    { input: 'spotify:token' },
    { input: 'example.com' },
    { input: 'Tim White', territory: 'GB' },
    { input: 'Tim White', artist: 'Other' },
  ])('rejects ambiguous or unsafe input shapes: %j', input => {
    expect(musicResolveQuery(musicResolveSchema.parse(input))).toBeNull();
  });

  it('honors cancellation before loading providers', async () => {
    const signal = AbortSignal.abort();
    await expect(
      resolvePublicMusic(
        musicResolveSchema.parse({ input: 'Tim White' }),
        signal
      )
    ).resolves.toEqual({ error: { code: 'CANCELLED', retryable: false } });
  });
});
