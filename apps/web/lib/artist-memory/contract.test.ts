import { describe, expect, it } from 'vitest';
import {
  ARTIST_MEMORY_CONTRACT,
  type ArtistMemoryFact,
  applyMemoryAction,
  artistMemoryFactSchema,
  memoryActionSchema,
  memoryFactDisplay,
  memoryReviewQueue,
  projectArtistMemory,
} from './contract';
import { observationToMemoryFact, profileToMemoryFacts } from './from-sources';

const NOW = '2026-10-29T12:00:00.000Z';

function fact(overrides: Partial<ArtistMemoryFact> = {}): ArtistMemoryFact {
  return {
    contract: ARTIST_MEMORY_CONTRACT,
    id: 'f1',
    profileId: 'p1',
    key: 'artist.press',
    kind: 'press',
    label: 'Press',
    value: 'Featured in a weekly roundup',
    display: 'Featured in a weekly roundup',
    provenance: [
      {
        sourceId: 'web.press',
        method: 'crawl',
        observedAt: NOW,
        sourceRef: { kind: 'memory_source_record', id: 'sr1' },
      },
    ],
    confidence: 0.7,
    visibility: 'public',
    review: 'found',
    origin: 'resolver',
    updatedAt: NOW,
    ...overrides,
  };
}

describe('memoryFactDisplay', () => {
  it('never shows an unsure fact as true', () => {
    expect(memoryFactDisplay(fact({ review: 'found', confidence: 0.99 }))).toBe(
      'confirm_one_tap'
    );
    expect(
      memoryFactDisplay(fact({ review: 'verified', confidence: 0.6 }))
    ).toBe('confirm_one_tap');
  });
  it('shows owner-reviewed and well-verified facts', () => {
    expect(
      memoryFactDisplay(fact({ review: 'verified', confidence: 0.9 }))
    ).toBe('show');
    expect(
      memoryFactDisplay(fact({ review: 'confirmed', confidence: 0.1 }))
    ).toBe('show');
    expect(memoryFactDisplay(fact({ review: 'corrected' }))).toBe('show');
  });
  it('hides hidden and rejected facts', () => {
    expect(memoryFactDisplay(fact({ review: 'hidden' }))).toBe('hide');
    expect(memoryFactDisplay(fact({ review: 'rejected' }))).toBe('hide');
  });
});

describe('applyMemoryAction', () => {
  it('confirm marks the fact confirmed and tells the resolver', () => {
    const { fact: next, feedback } = applyMemoryAction(
      fact(),
      { type: 'confirm' },
      NOW
    );
    expect(next.review).toBe('confirmed');
    expect(feedback).toEqual({
      signal: 'owner_confirmed',
      factKey: 'artist.press',
      sourceIds: ['web.press'],
      observedAt: NOW,
    });
  });

  it('correct replaces the value, records the artist as source, and emits a correction', () => {
    const { fact: next, feedback } = applyMemoryAction(
      fact(),
      { type: 'correct', value: 'Fixed', display: 'Fixed' },
      NOW
    );
    expect(next).toMatchObject({
      value: 'Fixed',
      review: 'corrected',
      confidence: 1,
    });
    expect(next.provenance[0]).toMatchObject({ sourceId: 'jovie.artist' });
    expect(feedback?.signal).toBe('user_correction');
    expect(artistMemoryFactSchema.safeParse(next).success).toBe(true);
  });

  it('hide is a privacy choice, not a wrongness claim', () => {
    const { fact: next, feedback } = applyMemoryAction(
      fact(),
      { type: 'hide' },
      NOW
    );
    expect(next.review).toBe('hidden');
    expect(feedback).toBeNull();
  });

  it('reject feeds negative evidence back', () => {
    expect(
      applyMemoryAction(fact(), { type: 'reject' }, NOW).feedback?.signal
    ).toBe('owner_rejected');
  });

  it('emits no feedback for facts only the artist ever asserted', () => {
    const own = fact({
      provenance: [
        { sourceId: 'jovie.artist', method: 'settings_form', observedAt: NOW },
      ],
    });
    expect(applyMemoryAction(own, { type: 'reject' }, NOW).feedback).toBeNull();
  });

  it('rejects malformed actions at the boundary', () => {
    expect(
      memoryActionSchema.safeParse({ type: 'delete_everything' }).success
    ).toBe(false);
    expect(
      memoryActionSchema.safeParse({ type: 'correct', value: 'x', display: '' })
        .success
    ).toBe(false);
  });
});

describe('projectArtistMemory', () => {
  const facts = [
    fact({ id: 'public-shown', review: 'confirmed', visibility: 'public' }),
    fact({ id: 'agents-shown', review: 'confirmed', visibility: 'agents' }),
    fact({ id: 'private-shown', review: 'confirmed', visibility: 'private' }),
    fact({ id: 'public-unsure', review: 'found', visibility: 'public' }),
    fact({ id: 'public-hidden', review: 'hidden', visibility: 'public' }),
  ];
  const ids = (xs: ArtistMemoryFact[]) => xs.map(f => f.id);

  it('gives the owner everything, review queue included', () => {
    expect(ids(projectArtistMemory(facts, 'owner'))).toHaveLength(5);
  });
  it('gives agents shown facts at agents visibility or wider', () => {
    expect(ids(projectArtistMemory(facts, 'agent'))).toEqual([
      'public-shown',
      'agents-shown',
    ]);
  });
  it('gives the public only public, shown facts', () => {
    expect(ids(projectArtistMemory(facts, 'public'))).toEqual(['public-shown']);
  });
  it('strips private source references outside the owner view', () => {
    const [projected] = projectArtistMemory(facts, 'public');
    expect(projected?.provenance[0]).not.toHaveProperty('sourceRef');
    expect(facts[0]?.provenance[0]).toHaveProperty('sourceRef');
  });
});

describe('memoryReviewQueue', () => {
  it('lists only facts that need one tap, most confident first', () => {
    const queue = memoryReviewQueue([
      fact({ id: 'a', confidence: 0.4 }),
      fact({ id: 'b', confidence: 0.8 }),
      fact({ id: 'c', review: 'confirmed' }),
    ]);
    expect(queue.map(f => f.id)).toEqual(['b', 'a']);
  });
});

describe('from-sources adapters', () => {
  it('maps settings fields to confirmed artist facts and skips blanks', () => {
    const facts = profileToMemoryFacts({
      id: 'p1',
      bio: '  Producer and songwriter.  ',
      careerHighlights: '',
      genres: ['house', ' ', 'disco'],
      location: null,
      activeSinceYear: 2014,
      updatedAt: NOW,
    });
    expect(facts.map(f => f.key)).toEqual([
      'artist.bio',
      'artist.genres',
      'artist.active_since',
    ]);
    expect(facts[0]).toMatchObject({
      display: 'Producer and songwriter.',
      review: 'confirmed',
    });
    expect(facts[1]?.display).toBe('house, disco');
    for (const f of facts)
      expect(artistMemoryFactSchema.safeParse(f).success).toBe(true);
  });

  it('keeps career highlights off the public projection', () => {
    const facts = profileToMemoryFacts({
      id: 'p1',
      bio: null,
      careerHighlights: 'Opened a regional tour',
      genres: null,
      location: null,
      activeSinceYear: null,
      updatedAt: NOW,
    });
    expect(projectArtistMemory(facts, 'public')).toHaveLength(0);
    expect(projectArtistMemory(facts, 'agent')).toHaveLength(1);
  });

  it('maps chat observations to private learned facts awaiting confirmation', () => {
    const f = observationToMemoryFact({
      id: '0f9c-11aa',
      profileId: 'p1',
      fact: 'Prefers to announce releases on Fridays',
      status: 'proposed',
      confidence: 'medium',
      sourceType: 'chat_message',
      sourceRecordId: 'sr9',
      createdAt: NOW,
    });
    expect(f).toMatchObject({
      origin: 'conversation',
      review: 'found',
      visibility: 'private',
      confidence: 0.6,
      key: 'artist.learned.0f9c11aa',
    });
    expect(artistMemoryFactSchema.safeParse(f).success).toBe(true);
    expect(projectArtistMemory([f], 'agent')).toHaveLength(0);
  });

  it('treats unparseable observation confidence as unknown', () => {
    const f = observationToMemoryFact({
      id: 'x',
      profileId: 'p1',
      fact: 'Something',
      status: 'accepted',
      confidence: 'very sure',
      sourceType: 'gmail_message',
      sourceRecordId: null,
      createdAt: NOW,
    });
    expect(f.confidence).toBeNull();
    expect(f.review).toBe('confirmed');
    expect(f.origin).toBe('connector');
  });
});
