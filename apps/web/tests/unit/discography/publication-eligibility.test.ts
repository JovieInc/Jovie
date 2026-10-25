import { describe, expect, it } from 'vitest';
import {
  classifyForPublication,
  type PublicationCandidate,
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
    spotifyArtists: [{ id: OWNER }],
  },
  ...over,
});

describe('classifyForPublication', () => {
  it('publishes a provider-verified release the owner is credited on', () => {
    const solo = rel('solo');
    expect(classifyForPublication(solo, [solo], OWNER)).toBe('publish');
  });

  it('publishes a co-primary version distinct from the solo (different date and artists)', () => {
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

  it('queues for review when there is no provider id', () => {
    const r = rel('x', { meta: {} });
    expect(classifyForPublication(r, [r], OWNER)).toBe('review');
  });

  it('queues for review when the owner is not credited by provider id', () => {
    const r = rel('x', {
      meta: { spotifyId: 'sp-x', spotifyArtists: [{ id: 'someone' }] },
    });
    expect(classifyForPublication(r, [r], OWNER)).toBe('review');
  });

  it('queues an ambiguous duplicate (same title, artists, date, other provider id)', () => {
    const a = rel('a');
    const b = rel('b');
    expect(classifyForPublication(a, [a, b], OWNER)).toBe('review');
    expect(classifyForPublication(b, [a, b], OWNER)).toBe('review');
  });
});
