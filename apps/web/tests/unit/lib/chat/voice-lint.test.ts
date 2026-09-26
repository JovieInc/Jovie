import { describe, expect, it } from 'vitest';
import {
  renderLine,
  SCRIPT_LINES,
  STREAM_ERROR_LINE,
} from '@/lib/chat/onboarding-script/script';
import { lintVoice } from '@/lib/chat/voice-lint';

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

describe('script lines respect the Jovie voice canon', () => {
  it.each(
    SCRIPT_LINES.map(line => [line.key, line] as const)
  )('%s passes the voice lint', (_key, line) => {
    const rendered = renderLine(line, {
      name: 'Test Artist',
      followers: 12_300,
      handle: 'testartist',
    });
    const result = lintVoice(rendered);
    expect(result.violations).toEqual([]);
  });

  it('has a lint-clean stream error line', () => {
    expect(lintVoice(STREAM_ERROR_LINE.text).ok).toBe(true);
  });

  it('keeps script line keys unique', () => {
    const keys = SCRIPT_LINES.map(line => line.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
