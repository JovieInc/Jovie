import { describe, expect, it } from 'vitest';
import { type AskJovieProfileContext, answerProfileQuestion } from './answer';

const ctx: AskJovieProfileContext = {
  username: 'luna',
  displayName: 'Luna Vale',
  bio: 'Indie pop artist from the coast.',
  location: 'Los Angeles',
  genres: ['indie pop', 'dream pop'],
  releases: [
    { title: 'Glasshouse', releaseType: 'album', releaseDate: '2026-03-01' },
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

const answer = (q: string, c = ctx) => {
  const r = answerProfileQuestion(q, c);
  return r.kind === 'answer' ? r.text : null;
};

describe('answerProfileQuestion', () => {
  it('answers "tell me about this artist" from grounded bio data', () => {
    const text = answer('Tell me about this artist');
    expect(text).toContain('Luna Vale');
    expect(text).toContain('Indie pop artist');
    expect(text).toContain('Los Angeles');
  });

  it('recommends the most recent release as a starting point', () => {
    expect(answer('What song should I start with?')).toContain('Glasshouse');
  });

  it('answers a city-scoped tour question with matching shows only', () => {
    const text = answer('When are they playing in Los Angeles?');
    expect(text).toContain('The Wiltern');
    expect(text).toContain('Los Angeles');
    expect(text).not.toContain('Brooklyn Steel');
  });

  it('lists upcoming shows when the requested city has none', () => {
    const text = answer('Are they playing in Chicago?');
    expect(text).toContain('Nothing listed there');
    expect(text).toContain('The Wiltern');
  });

  it('answers "where can I listen" with DSP links only', () => {
    const text = answer('Where can I listen?');
    expect(text).toContain('Spotify');
    expect(text).toContain('Apple Music');
    expect(text).not.toContain('Instagram');
  });

  it('answers questions about a named release', () => {
    const text = answer('Tell me about Waves');
    expect(text).toContain('"Waves"');
    expect(text).toContain('Luna Vale');
  });

  it('returns unknown for questions the data cannot answer', () => {
    expect(answer('What is their favorite pizza?')).toBeNull();
  });

  it('never fabricates releases or shows when none exist', () => {
    const empty: AskJovieProfileContext = {
      username: 'ghost',
      displayName: 'Ghost',
      releases: [],
      tourDates: [],
      links: [],
    };
    expect(answer('What should I start with?', empty)).toBeNull();
    expect(answer('Any upcoming shows?', empty)).toContain(
      "doesn't have any upcoming shows"
    );
  });
});
