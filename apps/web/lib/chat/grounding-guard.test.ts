import { describe, expect, it } from 'vitest';

import {
  buildGroundingFacts,
  checkSentence,
  createGroundedChunkStream,
  enforceGrounding,
  type GroundingFacts,
} from './grounding-guard';

/**
 * Deliberate-red transcript (Tim's Jovie Staging Mac screenshot, 2026-10-25):
 * the assistant said Spotify wasn't connected (it was, catalog imported) and
 * suggested songs that are not in the catalog. Every assertion below FAILS if
 * the guard is replaced by a pass-through (verified, see PR body).
 */
const FACTS: GroundingFacts = buildGroundingFacts(
  {
    spotifyUrl: 'https://open.spotify.com/artist/abc',
    spotifyFollowers: null,
    spotifyPopularity: null,
  },
  [{ title: 'Midnight Drive' }, { title: 'Glass Houses' }],
  ['Midnight Drive', 'Glass Houses', 'Slow Burn']
);

const TRANSCRIPT =
  "Spotify isn't connected yet, so I can't see your catalog. " +
  'But based on your songs, try pitching "Save the Night", "Testing The Lights", "Become One" and "Dont Look Down" to playlists. ' +
  'Your single "Midnight Drive" is already live.';

async function collect(text: string, facts: GroundingFacts, chunk = 7) {
  const chunks: { type: string; id: string; delta: string }[] = [];
  for (let i = 0; i < text.length; i += chunk) {
    chunks.push({
      type: 'text-delta',
      id: 't1',
      delta: text.slice(i, i + chunk),
    });
  }
  chunks.push({ type: 'text-end', id: 't1', delta: '' });
  const violations: string[] = [];
  let out = '';
  async function* src() {
    for (const c of chunks) yield c;
  }
  for await (const c of createGroundedChunkStream(src(), facts, v =>
    violations.push(v.kind)
  )) {
    if (c.type === 'text-delta') out += c.delta;
  }
  return { out, violations };
}

describe('grounding guard: the 2026-10-25 transcript', () => {
  it('the raw transcript contains the false claims (red baseline)', () => {
    expect(TRANSCRIPT).toMatch(/isn't connected/);
    expect(TRANSCRIPT).toContain('Save the Night');
  });

  it('rejects the false Spotify claim and the four invented titles', async () => {
    const { out, violations } = await collect(TRANSCRIPT, FACTS);
    expect(out).not.toMatch(/isn't connected/i);
    expect(out).toContain('Spotify is connected');
    for (const title of [
      'Save the Night',
      'Testing The Lights',
      'Become One',
      'Dont Look Down',
    ]) {
      expect(out).not.toContain(title);
    }
    expect(out).toContain('Midnight Drive');
    expect(violations).toEqual(
      expect.arrayContaining([
        'spotify-connection-contradiction',
        'unknown-catalog-title',
      ])
    );
  });

  it('whole-text variant agrees', () => {
    const { text, violations } = enforceGrounding(TRANSCRIPT, FACTS);
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('Midnight Drive');
    expect(text).not.toMatch(/isn't connected/i);
  });

  it('streams in tiny chunks without leaking a held sentence', async () => {
    const { out } = await collect(TRANSCRIPT, FACTS, 1);
    expect(out).not.toMatch(/Save the Night/);
  });
});

describe('grounding guard: no false positives', () => {
  it('allows real titles (case and apostrophe insensitive) and album tracks', () => {
    expect(
      checkSentence('Your track "midnight drive" is doing well.', FACTS)
    ).toBeNull();
    expect(checkSentence('Push your song "Slow Burn" next.', FACTS)).toBeNull();
  });

  it("allows quoted reference songs that are not presented as the artist's", () => {
    expect(
      checkSentence('Think of "Blinding Lights" for the pacing.', FACTS)
    ).toBeNull();
  });

  it('allows titles a tool returned this turn', () => {
    const sentence = 'Your single "Brand New Song" just landed.';
    expect(checkSentence(sentence, FACTS)).not.toBeNull();
    expect(
      checkSentence(sentence, FACTS, '{"title":"Brand New Song"}')
    ).toBeNull();
  });

  it('says Spotify is not connected when it truly is not', () => {
    const facts = buildGroundingFacts(
      { spotifyUrl: null, spotifyFollowers: null, spotifyPopularity: null },
      [],
      []
    );
    expect(checkSentence("Spotify isn't connected yet.", facts)).toBeNull();
  });

  it('skips the title rule when the catalog view is incomplete', () => {
    const facts = buildGroundingFacts(
      { spotifyUrl: 'x', spotifyFollowers: 1, spotifyPopularity: 1 },
      [{ title: 'A' }],
      null
    );
    expect(facts.catalogTitles).toEqual([]);
    expect(checkSentence('Your song "Zzz Top Hit" rocks.', facts)).toBeNull();
  });

  it('a null follower count alone still counts as connected via url', () => {
    expect(FACTS.spotifyConnected).toBe(true);
  });
});
