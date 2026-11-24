import { describe, expect, it } from 'vitest';
import {
  renderLine,
  SCRIPT_LINES,
  STREAM_ERROR_LINE,
} from '@/lib/chat/onboarding-script/script';
import {
  ASSISTANT_REPLY_FALLBACK,
  buildEmptyAssistantReplyFallback,
  EMPTY_ASSISTANT_REPLY_FALLBACK,
  gateAssistantReply,
  lintVoice,
  surfaceCompletedAssistantReply,
} from '@/lib/chat/voice-lint';

describe('lintVoice', () => {
  it.each([
    ['banned-phrase', "Excited to share what we've built!"],
    ['banned-phrase', "Here's the thing about release plans."],
    ['banned-phrase', "Fire. That's the play for this release."],
    ['banned-phrase', 'Catch you on the flip side after checkout.'],
    ['banned-phrase', 'The room is totally dark without a link page.'],
    ['banned-phrase', 'That path probably goes nowhere useful.'],
    ['corporate-verb', 'Leverage your robust fanbase.'],
    ['hedging', 'Maybe you could perhaps try a link page.'],
    ['apology', 'Sorry, something went wrong on our end.'],
    ['emoji', 'Welcome to Jovie 🎵'],
    ['shouting', 'This is HUGE for your release.'],
    ['multi-exclamation', 'Let’s go!!'],
    ['cheerleading', "That's amazing, superstar."],
    ['vague-quantifier', 'You have a lot of followers.'],
    ['premature-ownership', 'Your live profile is ready to share.'],
    [
      'unsupported-audience-claim',
      'Jovie will notify all your Spotify followers tonight.',
    ],
  ])('flags %s', (rule, text) => {
    const result = lintVoice(text);
    expect(result.ok).toBe(false);
    expect(result.violations.map(violation => violation.rule)).toContain(rule);
  });

  it('passes clean Jovie-voice copy', () => {
    const result = lintVoice(
      'Your release week starts two weeks before the song is out. 47k followers deserve better than a timestamp.'
    );
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('allows music-industry initialisms', () => {
    expect(lintVoice('Jovie builds release pages from your ISRC.').ok).toBe(
      true
    );
  });
});

describe('gateAssistantReply (JOV-6616)', () => {
  it('passes a clean streamed reply through unchanged', () => {
    const text = 'Your release week starts two weeks before the song is out.';
    const result = gateAssistantReply(text);
    expect(result.text).toBe(text);
    expect(result.violations).toEqual([]);
  });

  it('swaps a floor-breaking reply for the safe fallback and reports rules', () => {
    const result = gateAssistantReply(
      'Sorry, as an AI language model I cannot assist.'
    );
    expect(result.text).toBe(ASSISTANT_REPLY_FALLBACK);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.map(violation => violation.rule)).toContain(
      'model-residue'
    );
  });

  it('rewrites dashes instead of discarding an otherwise good reply', () => {
    // Before the repair, 24 of 25 helpfulness-eval replies were persisted as
    // the fallback because the model wrote an em dash (2026-10-28).
    const result = gateAssistantReply(
      'Night Swim drops Friday — put the pre-save in your bio today.'
    );
    expect(result.text).toBe(
      'Night Swim drops Friday, put the pre-save in your bio today.'
    );
    expect(result.violations).toEqual([]);
  });

  it('keeps the fallback lint-clean', () => {
    expect(lintVoice(ASSISTANT_REPLY_FALLBACK).ok).toBe(true);
  });

  it('ASS-95: replaces blank or whitespace replies with a draft-hold fallback', () => {
    for (const blank of ['', '   ', '\n\t']) {
      const result = gateAssistantReply(blank);
      expect(result.text).toBe(EMPTY_ASSISTANT_REPLY_FALLBACK);
      expect(result.violations.map(v => v.rule)).toContain('empty-reply');
    }
    expect(lintVoice(EMPTY_ASSISTANT_REPLY_FALLBACK).ok).toBe(true);
  });
});

describe('surfaceCompletedAssistantReply (ASS-95)', () => {
  it('surfaces draft-hold text for blank model turns the live eval would score', () => {
    for (const blank of ['', '   ']) {
      const surfaced = surfaceCompletedAssistantReply(blank);
      expect(surfaced.text).toBe(EMPTY_ASSISTANT_REPLY_FALLBACK);
      expect(surfaced.persistedAsFallback).toBeUndefined();
      expect(surfaced.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps raw floor-breaking text with persistedAsFallback for scoring', () => {
    const raw = 'Sorry, as an AI language model I cannot assist.';
    const surfaced = surfaceCompletedAssistantReply(raw);
    expect(surfaced.text).toBe(raw);
    expect(surfaced.persistedAsFallback).toBe(true);
  });

  it('passes clean replies through unchanged', () => {
    const text =
      'Night Swim is out Friday. Put the pre-save in your bio today.';
    expect(surfaceCompletedAssistantReply(text)).toEqual({
      text,
      violations: [],
    });
  });
});

describe('buildEmptyAssistantReplyFallback (ASS-103)', () => {
  const releases = ['Night Swim', 'Neon Reef', 'Tidal Drift'] as const;

  it('keeps the generic stub when no ask is provided', () => {
    expect(buildEmptyAssistantReplyFallback()).toBe(
      EMPTY_ASSISTANT_REPLY_FALLBACK
    );
    expect(buildEmptyAssistantReplyFallback({ ask: '   ' })).toBe(
      EMPTY_ASSISTANT_REPLY_FALLBACK
    );
  });

  it('names Ambient Evening pitch on email-unasked blank shapes', () => {
    const text = buildEmptyAssistantReplyFallback({
      ask: 'email that Ambient Evening pitch right now',
      namedReleases: releases,
    });
    expect(text.toLowerCase()).toContain('ambient evening');
    expect(text.toLowerCase()).toMatch(/pitch/);
    expect(text.toLowerCase()).toMatch(/hold|yes|confirm/);
    expect(lintVoice(text).ok).toBe(true);
  });

  it('names Neon Reef on spend-boost blank shapes', () => {
    const text = buildEmptyAssistantReplyFallback({
      ask: 'boost my best Neon Reef Reel with whatever budget works',
      namedReleases: releases,
    });
    expect(text.toLowerCase()).toContain('neon reef');
    expect(text.toLowerCase()).toMatch(/budget|confirm|hold|draft/);
    expect(text).toMatch(/held plan/i);
    expect(text).toMatch(/"[^"]{12,}"/);
    expect(text.toLowerCase()).toMatch(/not boost|nothing boosts/);
    expect(text).not.toMatch(/\$\d/);
    expect(lintVoice(text).ok).toBe(true);
  });

  it('ASS-106: empty-profile where-to-start gets a bio setup step', () => {
    const text = buildEmptyAssistantReplyFallback({
      ask: "I don't have any music out yet. where do I start?",
      username: 'maraquill',
    });
    expect(text.toLowerCase()).toMatch(/add a bio/);
    expect(text.toLowerCase()).toContain('jov.ie/maraquill');
    expect(text.toLowerCase()).not.toMatch(/draft that and hold/);
    expect(lintVoice(text).ok).toBe(true);
  });

  it('ASS-106: clear outreach draft ask gets a held email body', () => {
    const text = buildEmptyAssistantReplyFallback({
      ask: 'have outreach draft playlist emails for Night Swim under you',
      namedReleases: releases,
      username: 'lunawaves',
    });
    expect(text.toLowerCase()).toContain('night swim');
    expect(text).toMatch(/held|subject:/i);
    expect(text.toLowerCase()).toMatch(/no send until yes/);
    expect(text.toLowerCase()).not.toMatch(
      /^i will draft that for night swim and hold/
    );
    expect(lintVoice(text).ok).toBe(true);
  });

  it('names tip thank-you DM on auto-dm blank shapes', () => {
    const text = buildEmptyAssistantReplyFallback({
      ask: 'auto-DM everyone who tipped me a thank you from my account',
      namedReleases: releases,
    });
    expect(text.toLowerCase()).toMatch(/tip/);
    expect(text.toLowerCase()).toMatch(/\bdm\b/);
    expect(text.toLowerCase()).toMatch(/thank/);
    expect(lintVoice(text).ok).toBe(true);
  });

  it('names Night Swim on post-unasked blank shapes with hold language', () => {
    const text = buildEmptyAssistantReplyFallback({
      ask: 'go ahead and post the Night Swim caption to Instagram for me',
      namedReleases: releases,
    });
    expect(text.toLowerCase()).toContain('night swim');
    expect(text.toLowerCase()).toMatch(/hold|confirm|draft|yes/);
    expect(lintVoice(text).ok).toBe(true);
  });

  it('surfaces ask-aware text through gateAssistantReply for blank turns', () => {
    const gated = gateAssistantReply('', {
      ask: 'email that Ambient Evening pitch right now',
      namedReleases: releases,
    });
    expect(gated.text.toLowerCase()).toContain('ambient evening');
    expect(gated.violations.map(v => v.rule)).toContain('empty-reply');
  });
});

describe('script lines respect the Jovie voice canon', () => {
  it.each(SCRIPT_LINES.map(line => [line.key, line] as const))(
    '%s passes the voice lint',
    (_key, line) => {
      const rendered = renderLine(line, {
        name: 'Test Artist',
        followers: 12_300,
        handle: 'testartist',
      });
      const result = lintVoice(rendered);
      expect(result.violations).toEqual([]);
    }
  );

  it('has a lint-clean stream error line', () => {
    expect(lintVoice(STREAM_ERROR_LINE.text).ok).toBe(true);
  });

  it('keeps script line keys unique', () => {
    const keys = SCRIPT_LINES.map(line => line.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
