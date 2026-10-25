import { describe, expect, it } from 'vitest';
import {
  classifyForPublication,
  classifyPublication,
  describeProvenance,
  type PublicationCandidate,
  providerAlbumIdOf,
  suggestAutoPublishReasons,
} from '@/lib/discography/publication-eligibility';

const OWNER = 'tim-id';
const rel = (
  id: string,
  over: Partial<PublicationCandidate> & { meta?: unknown } = {}
): PublicationCandidate => ({
  id,
  title: 'Seaside Heights',
  releaseDate: new Date('2020-05-14T00:00:00Z'),
  metadata: over.meta ?? {
    spotifyId: `sp-${id}`,
    spotifyArtists: [{ id: OWNER, name: 'Tim White' }],
  },
  ...over,
});

describe('classifyPublication', () => {
  it('publishes a provider-verified release the owner is credited on', () => {
    const solo = rel('solo');
    expect(classifyPublication(solo, [solo], OWNER)).toEqual({
      decision: 'publish',
      reason: 'verified',
    });
    expect(classifyForPublication(solo, [solo], OWNER)).toBe('publish');
  });

  it('publishes a co-primary version distinct from the solo', () => {
    const solo = rel('solo');
    const vigel = rel('vigel', {
      releaseDate: new Date('2019-09-20T00:00:00Z'),
      meta: {
        spotifyId: 'sp-vigel',
        spotifyArtists: [{ id: 'vigel-id' }, { id: OWNER }],
      },
    });
    expect(classifyForPublication(vigel, [solo, vigel], OWNER)).toBe('publish');
  });

  it('prompts when there is no provider id', () => {
    const r = rel('x', { meta: {} });
    expect(classifyPublication(r, [r], OWNER).reason).toBe('no_provider_id');
  });

  it('prompts when the owner is not credited by provider id', () => {
    const r = rel('x', {
      meta: { spotifyId: 'sp-x', spotifyArtists: [{ id: 'someone' }] },
    });
    expect(classifyPublication(r, [r], OWNER).reason).toBe(
      'owner_not_credited'
    );
  });

  it('prompts on an ambiguous duplicate', () => {
    const a = rel('a');
    const b = rel('b');
    expect(classifyPublication(a, [a, b], OWNER).reason).toBe(
      'duplicate_candidate'
    );
  });
});

describe('describeProvenance', () => {
  it('states where it was found, the year, the credit, and why it is unsure', () => {
    const r = rel('x', {
      meta: {
        spotifyId: 'sp-x',
        spotifyArtists: [{ id: 'someone', name: 'Someone Else' }],
      },
    });
    expect(describeProvenance(r, 'owner_not_credited')).toBe(
      "Found on Spotify · 2020 · credited to Someone Else · unsure: your Spotify artist id isn't credited"
    );
  });
  it('exposes the provider album id', () => {
    expect(providerAlbumIdOf(rel('x').metadata)).toBe('sp-x');
  });
});

describe('suggestAutoPublishReasons', () => {
  const opts = { minDecisions: 20, maxRejectRate: 0.05 };
  it('promotes only reasons with enough decisions and a low reject rate', () => {
    expect(
      suggestAutoPublishReasons(
        [
          { reason: 'duplicate_candidate', accepted: 30, rejected: 0 },
          { reason: 'owner_not_credited', accepted: 10, rejected: 12 },
          { reason: 'no_provider_id', accepted: 5, rejected: 0 },
        ],
        opts
      )
    ).toEqual(['duplicate_candidate']);
  });
});
