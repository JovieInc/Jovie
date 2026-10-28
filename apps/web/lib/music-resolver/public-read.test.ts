import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InHouseResolution } from './in-house-contracts';

const resolve = vi.hoisted(() => vi.fn());
vi.mock('./in-house', () => ({ resolveInHouse: resolve }));

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

const richResult = {
  status: 'resolved',
  kind: 'artist',
  title: 'Tim White',
  artist: 'Tim White',
  isrc: null,
  upc: null,
  mbid,
  links: [
    {
      provider: 'spotify',
      url: 'https://open.spotify.com/artist/123',
      provenance: 'musicbrainz_url_rel',
      confidence: 0.8,
    },
    {
      provider: 'instagram',
      url: 'https://instagram.com/private-graph',
      provenance: 'musicbrainz_url_rel',
      confidence: 1,
    },
  ],
  candidates: [],
  confidence: 1,
  candidateCount: 2,
  provenance: {
    spotify: 'musicbrainz_url_rel',
    instagram: 'private-graph',
    access_token: 'private-source-token',
  },
  sourceCredentials: { token: 'private-source-token' },
  canAutoCreateLinks: true,
  artistMetadata: {
    source: 'musicbrainz',
    sourceUrl: `https://musicbrainz.org/artist/${mbid}?token=private-source-token#private`,
    disambiguation: 'Singer',
    aliases: [],
    type: 'Person',
    country: 'US',
    area: null,
    origin: null,
    isnis: ['0000000427529721'],
    ipis: [],
    wikidataIds: [],
    externalLinks: [
      {
        provider: 'instagram',
        url: 'https://instagram.com/private-graph',
        relationship: 'social network',
        provenance: 'musicbrainz_url_rel',
      },
    ],
    releaseGroups: [
      {
        mbid: 'private-collection',
        title: 'Private release graph',
        primaryType: 'Album',
        firstReleaseDate: null,
      },
    ],
    releaseGroupsComplete: true,
  },
} satisfies InHouseResolution & {
  sourceCredentials: unknown;
  canAutoCreateLinks: boolean;
};

describe('shared public resolver boundary', () => {
  afterEach(() => vi.resetAllMocks());

  it('projects core identity after fresh resolution and repeated cached/expanded results without mutation', async () => {
    resolve.mockResolvedValue(richResult);
    const original = JSON.stringify(richResult);
    const input = musicResolveSchema.parse({ input: mbid });
    const first = await resolvePublicMusic(input);
    expect(await resolvePublicMusic(input)).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(
      /instagram|private-|externalLinks|releaseGroups|sourceCredentials|canAutoCreateLinks/
    );
    expect(first).toMatchObject({
      status: 'resolved',
      mbid,
      confidence: 0.8,
      candidateCount: 1,
      provenance: { spotify: 'musicbrainz_url_rel' },
      artistMetadata: { isnis: ['0000000427529721'] },
    });
    expect(first.links).toHaveLength(1);
    expect(JSON.stringify(richResult)).toBe(original);
  });

  it.each([
    'fields',
    'expand',
    'tier',
    'plan',
    'maxCharge',
    'sourcePermissions',
    'batch',
  ])('rejects caller-supplied %s authority before resolution', async key => {
    expect(
      musicResolveSchema.safeParse({ input: mbid, [key]: 'paid' }).success
    ).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('withholds metadata with an unrecognized source destination', async () => {
    resolve.mockResolvedValue({
      ...richResult,
      artistMetadata: {
        ...richResult.artistMetadata,
        sourceUrl: 'https://private.example/artist',
      },
    });
    const result = await resolvePublicMusic(
      musicResolveSchema.parse({ input: mbid })
    );
    expect(result.artistMetadata).toBeUndefined();
  });

  it('reports provider failure without a successful result', async () => {
    resolve.mockResolvedValue({ ...richResult, status: 'upstream_error' });
    expect(
      await resolvePublicMusic(musicResolveSchema.parse({ input: mbid }))
    ).toEqual({ error: { code: 'UPSTREAM_FAILURE', retryable: true } });
  });

  it('rechecks cancellation after provider completion before returning data', async () => {
    const controller = new AbortController();
    resolve.mockImplementation(async () => {
      controller.abort();
      return richResult;
    });
    expect(
      await resolvePublicMusic(
        musicResolveSchema.parse({ input: mbid }),
        controller.signal
      )
    ).toEqual({ error: { code: 'CANCELLED', retryable: false } });
  });
});
