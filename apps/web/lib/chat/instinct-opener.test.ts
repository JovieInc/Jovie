import { describe, expect, it } from 'vitest';
import { lintVoice } from '@/lib/chat/voice-lint';
import { buildFixture } from '@/tests/eval/helpfulness/fixtures';
import {
  buildInstinctOpener,
  draftBioFromFacts,
  isBareGreeting,
} from './instinct-opener';

const NOW = new Date('2026-10-28T15:00:00Z');

describe('isBareGreeting', () => {
  it.each(['yo', 'Yo!', 'hey jovie', 'hi', "what's up", 'gm', 'good morning'])(
    'treats %s as a greeting',
    text => expect(isBareGreeting(text)).toBe(true)
  );
  it.each([
    'yo optimize my youtube',
    'hi can you write my bio',
    '',
    'how do I get more listeners',
  ])('hands %s to the model', text => expect(isBareGreeting(text)).toBe(false));
});

describe('buildInstinctOpener', () => {
  it('leads with an upcoming release inside six weeks', () => {
    const f = buildFixture('established', NOW);
    const opener = buildInstinctOpener({
      text: 'hi',
      artist: f.artist,
      releases: f.releases,
      now: NOW,
    });
    expect(opener?.intent).toBe('opener_upcoming_release');
    expect(opener?.text).toContain('Night Swim drops in 2 days');
  });

  it('drafts a bio from verified facts when the bio is empty', () => {
    const f = buildFixture('catalog', NOW);
    const opener = buildInstinctOpener({
      text: 'yo',
      artist: f.artist,
      releases: f.releases,
      now: NOW,
    });
    expect(opener?.intent).toBe('opener_draft_bio');
    expect(opener?.text).toContain(
      'Cass Arden is a pop and electronic artist with 48 releases since 2017.'
    );
    expect(opener?.text).toContain('jov.ie/cassarden');
  });

  it('offers the YouTube plan once the bio is set', () => {
    const f = buildFixture('catalog', NOW);
    const opener = buildInstinctOpener({
      text: 'hey',
      artist: { ...f.artist, bio: 'Pop artist.' },
      releases: f.releases,
      now: NOW,
    });
    expect(opener?.intent).toBe('opener_youtube_plan');
    expect(opener?.text).toContain('@cassarden');
  });

  it('asks for the Spotify name when the profile has no music', () => {
    const f = buildFixture('new', NOW);
    const opener = buildInstinctOpener({
      text: 'hi',
      artist: f.artist,
      releases: f.releases,
      now: NOW,
    });
    expect(opener?.intent).toBe('opener_connect_music');
  });

  it('returns null for real questions', () => {
    const f = buildFixture('catalog', NOW);
    expect(
      buildInstinctOpener({
        text: 'optimize my youtube',
        artist: f.artist,
        releases: f.releases,
        now: NOW,
      })
    ).toBeNull();
  });

  it('every opener passes the persona copy floor', () => {
    for (const id of ['established', 'catalog', 'new', 'lapsed'] as const) {
      const f = buildFixture(id, NOW);
      const opener = buildInstinctOpener({
        text: 'yo',
        artist: f.artist,
        releases: f.releases,
        now: NOW,
      });
      if (opener) expect(lintVoice(opener.text).violations).toEqual([]);
    }
  });
});

describe('draftBioFromFacts', () => {
  it('returns null with no catalog and never invents numbers', () => {
    const f = buildFixture('new', NOW);
    expect(draftBioFromFacts(f.artist, [])).toBeNull();
    const lapsed = buildFixture('lapsed', NOW);
    expect(draftBioFromFacts(lapsed.artist, lapsed.releases)).toBe(
      'Harbor Static is an indie rock and post-punk artist with 2 releases since 2025. The latest is Low Tide Choir.'
    );
  });
});
