import { describe, expect, it } from 'vitest';
import {
  buildKnownStateAnswer,
  matchKnownStateIntent,
} from '@/lib/chat/known-state-answer';
import { gateAssistantReply } from '@/lib/chat/voice-lint';

const NOW = new Date('2026-11-02T12:00:00.000Z');

const baseFacts = {
  username: 'timwhite',
  hasMusicLinks: true,
  hasSocialLinks: true,
  releases: [] as Array<{ title: string; releaseDate: string | null }>,
};

describe('matchKnownStateIntent', () => {
  it.each([
    'What should I do this week to get more listeners?',
    'what should i do this week',
    'okay what should I focus on next week?',
    'How do I get more listeners?',
    'how can I grow more streams this week',
  ])('matches %s', text => {
    expect(matchKnownStateIntent(text)).toBe('weekly_growth');
  });

  it.each([
    '',
    'What should I do this week about my Spotify pitch for Midnight?',
    'How do I get more listeners in Brazil?',
    'Write me a bio',
    'what should I do',
  ])('leaves %s to the model', text => {
    expect(matchKnownStateIntent(text)).toBeNull();
  });
});

describe('buildKnownStateAnswer', () => {
  it('returns null for questions it does not own', () => {
    expect(
      buildKnownStateAnswer({
        text: 'Write me a bio',
        facts: baseFacts,
        now: NOW,
      })
    ).toBeNull();
  });

  it('builds around an upcoming release with its real date and no numbers', () => {
    const answer = buildKnownStateAnswer({
      text: 'What should I do this week to get more listeners?',
      facts: {
        ...baseFacts,
        releases: [
          { title: 'Old Song', releaseDate: '2025-01-10T00:00:00.000Z' },
          { title: 'Midnight', releaseDate: '2026-11-14T00:00:00.000Z' },
        ],
      },
      now: NOW,
    });

    expect(answer?.intent).toBe('weekly_growth');
    expect(answer?.text).toContain('Build up to Midnight, out Nov 14.');
    expect(answer?.text).toContain('/timwhite');
    expect(answer?.text).not.toContain('Old Song');
    // Only the release date may carry digits besides list numbering.
    const digits = answer?.text
      .replace(/^\d+\. /gm, '')
      .replace('Nov 14', '')
      .match(/\d/g);
    expect(digits).toBeNull();
    expect(gateAssistantReply(answer?.text ?? '').violations).toEqual([]);
  });

  it('pushes a recent release and flags missing links from known state', () => {
    const answer = buildKnownStateAnswer({
      text: 'how do I get more listeners',
      facts: {
        ...baseFacts,
        hasMusicLinks: false,
        hasSocialLinks: false,
        releases: [{ title: 'Fresh', releaseDate: '2026-10-20T00:00:00.000Z' }],
      },
      now: NOW,
    });

    expect(answer?.text).toContain('1. Add your streaming links.');
    expect(answer?.text).toContain('2. Keep pushing Fresh, out Oct 20.');
    expect(answer?.text).toContain('3. Add your socials');
    expect(answer?.text).toContain('4. Put ');
  });

  it('gives an older catalog a second push and asks for music when there is none', () => {
    const older = buildKnownStateAnswer({
      text: 'what should I do this week',
      facts: {
        ...baseFacts,
        releases: [{ title: 'Classic', releaseDate: '2024-03-01' }],
      },
      now: NOW,
    });
    expect(older?.text).toContain('Give Classic a second push.');

    const empty = buildKnownStateAnswer({
      text: 'what should I do this week',
      facts: baseFacts,
      now: NOW,
    });
    expect(empty?.text).toContain('Tell me about your next release');
  });
});
