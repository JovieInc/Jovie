import { describe, expect, it } from 'vitest';
import { type AskJovieProfileContext, answerProfileQuestion } from './answer';

const ctx: AskJovieProfileContext = {
  username: 'luna',
  displayName: 'Luna Vale',
  bio: 'Indie pop artist from the coast.',
  location: 'Los Angeles',
  genres: ['indie pop', 'dream pop'],
  releases: [
    {
      title: 'Glasshouse',
      releaseType: 'album',
      releaseDate: '2026-03-01',
    },
    { title: 'Waves', releaseType: 'single', releaseDate: '2025-11-10' },
  ],
  tourDates: [
    {
      startDate: '2026-10-14',
      venueName: 'The Wiltern',
      city: 'Los Angeles',
      region: 'CA',
      country: 'US',
    },
    {
      startDate: '2026-11-02',
      venueName: 'Brooklyn Steel',
      city: 'Brooklyn',
      region: 'NY',
      country: 'US',
    },
  ],
  links: [
    { platform: 'spotify', url: 'https://open.spotify.com/artist/x' },
    { platform: 'apple_music', url: 'https://music.apple.com/artist/x' },
    { platform: 'instagram', url: 'https://instagram.com/luna' },
  ],
};

describe('answerProfileQuestion', () => {
  it('answers "tell me about this artist" from grounded bio data', () => {
    const result = answerProfileQuestion('Tell me about this artist', ctx);
    expect(result.kind).toBe('answer');
    if (result.kind === 'answer') {
      expect(result.text).toContain('Luna Vale');
      expect(result.text).toContain('Indie pop artist');
      expect(result.text).toContain('Los Angeles');
    }
  });

  it('recommends the most recent release as a starting point', () => {
    const result = answerProfileQuestion('What song should I start with?', ctx);
    expect(result).toEqual({
      kind: 'answer',
      text: expect.stringContaining('Glasshouse'),
    });
  });

  it('answers a city-scoped tour question with matching shows only', () => {
    const result = answerProfileQuestion(
      'When are they playing in Los Angeles?',
      ctx
    );
    expect(result.kind).toBe('answer');
    if (result.kind === 'answer') {
      expect(result.text).toContain('The Wiltern');
      expect(result.text).toContain('Los Angeles');
      expect(result.text).not.toContain('Brooklyn Steel');
    }
  });

  it('lists upcoming shows when the requested city has none', () => {
    const result = answerProfileQuestion('Are they playing in Chicago?', ctx);
    expect(result.kind).toBe('answer');
    if (result.kind === 'answer') {
      expect(result.text).toContain('Nothing listed there');
      expect(result.text).toContain('The Wiltern');
    }
  });

  it('answers "where can I listen" with DSP links only', () => {
    const result = answerProfileQuestion('Where can I listen?', ctx);
    expect(result.kind).toBe('answer');
    if (result.kind === 'answer') {
      expect(result.text).toContain('Spotify');
      expect(result.text).toContain('Apple Music');
      expect(result.text).not.toContain('Instagram');
    }
  });

  it('answers questions about a named release', () => {
    const result = answerProfileQuestion('Tell me about Waves', ctx);
    expect(result.kind).toBe('answer');
    if (result.kind === 'answer') {
      expect(result.text).toContain('"Waves"');
      expect(result.text).toContain('Luna Vale');
    }
  });

  it('returns unknown for questions the data cannot answer', () => {
    expect(answerProfileQuestion('What is their favorite pizza?', ctx)).toEqual(
      { kind: 'unknown' }
    );
  });

  it('never fabricates releases or shows when none exist', () => {
    const empty: AskJovieProfileContext = {
      username: 'ghost',
      displayName: 'Ghost',
      releases: [],
      tourDates: [],
      links: [],
    };
    expect(answerProfileQuestion('What should I start with?', empty)).toEqual({
      kind: 'unknown',
    });
    const tour = answerProfileQuestion('Any upcoming shows?', empty);
    expect(tour.kind).toBe('answer');
    if (tour.kind === 'answer') {
      expect(tour.text).toContain("doesn't have any upcoming shows");
    }
  });
});
