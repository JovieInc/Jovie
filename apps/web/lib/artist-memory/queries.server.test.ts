import { beforeEach, describe, expect, it, vi } from 'vitest';

const results: unknown[][] = [];

function chain(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy']) {
    q[m] = () => q;
  }
  q.limit = () => Promise.resolve(rows);
  return q;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { select: () => chain(results.shift() ?? []) },
}));

const NOW = new Date('2026-10-29T12:00:00.000Z');
const PROFILE = {
  id: 'p1',
  bio: 'Producer.',
  careerHighlights: 'Opened a regional tour',
  genres: ['house'],
  location: null,
  activeSinceYear: null,
  updatedAt: NOW,
};
const OBSERVATION = {
  id: 'obs-1',
  fact: 'Announces releases on Fridays',
  status: 'proposed' as const,
  confidence: '0.7',
  sourceRecordId: 'sr1',
  sourceType: 'chat_message',
  createdAt: NOW,
};

describe('loadArtistMemory', () => {
  beforeEach(() => {
    results.length = 0;
  });

  it('returns nothing for an unknown profile without reading observations', async () => {
    results.push([]);
    const { loadArtistMemory } = await import('./queries.server');
    expect(await loadArtistMemory('missing', 'owner')).toEqual([]);
  });

  it('merges settings facts and learned observations for the owner', async () => {
    results.push([PROFILE], [OBSERVATION]);
    const { loadArtistMemory } = await import('./queries.server');
    const facts = await loadArtistMemory('p1', 'owner');
    expect(facts.map(f => f.key)).toEqual([
      'artist.bio',
      'artist.career_highlights',
      'artist.genres',
      'artist.learned.obs1',
    ]);
    expect(facts[0]?.updatedAt).toBe(NOW.toISOString());
    expect(facts[3]).toMatchObject({ review: 'found', origin: 'conversation' });
  });

  it('projects for the public: no agent-only or unconfirmed facts', async () => {
    results.push([PROFILE], [OBSERVATION]);
    const { loadArtistMemory } = await import('./queries.server');
    const facts = await loadArtistMemory('p1', 'public');
    expect(facts.map(f => f.key)).toEqual(['artist.bio', 'artist.genres']);
  });

  it('tolerates a missing timestamp', async () => {
    results.push([{ ...PROFILE, updatedAt: null }], []);
    const { loadArtistMemory } = await import('./queries.server');
    const [first] = await loadArtistMemory('p1', 'owner');
    expect(first?.updatedAt).toBe('1970-01-01T00:00:00.000Z');
  });
});
