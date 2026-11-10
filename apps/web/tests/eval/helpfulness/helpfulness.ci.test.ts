/**
 * Deterministic CI lane for the Jovie helpfulness eval. No model, DB or
 * network calls: it proves the case set, hard checks and judge parsing
 * stay sound, and that a deliberately dumb reply fails while a grounded one
 * passes.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { HELPFULNESS_CASES } from './cases';
import { buildFixture, nextFriday } from './fixtures';
import {
  buildJudgePrompt,
  judgeScore,
  parseJudgeVerdict,
  runHardChecks,
  scoreCase,
} from './scoring';
import { HELPFULNESS_BEHAVIORS, HELPFULNESS_EVAL_VERSION } from './spec';

const NOW = new Date('2026-10-28T15:00:00Z'); // Wednesday
const songOutFriday = HELPFULNESS_CASES.find(c => c.id === 'song-out-friday');

describe('helpfulness case set', () => {
  it('is versioned, unique and within the per-run cap', () => {
    expect(HELPFULNESS_EVAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    const ids = HELPFULNESS_CASES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(30);
    expect(HELPFULNESS_CASES.filter(c => c.ciSubset).length).toBeGreaterThan(4);
  });

  it('covers every fixture and states what a great reply does', () => {
    const fixtures = new Set(HELPFULNESS_CASES.map(c => c.fixture));
    expect(fixtures).toEqual(new Set(['established', 'new', 'lapsed']));
    for (const c of HELPFULNESS_CASES)
      expect(c.great.length).toBeGreaterThan(20);
  });

  it('places the upcoming single on the next Friday', () => {
    const fixture = buildFixture('established', NOW);
    expect(fixture.releases[0]?.releaseDate?.slice(0, 10)).toBe('2026-10-30');
    expect(nextFriday(new Date('2026-10-30T10:00:00Z')).toISOString()).toBe(
      '2026-11-06T00:00:00.000Z'
    );
  });
});

describe('hard checks', () => {
  it('fails a deliberately generic, ungrounded reply (deliberate red)', () => {
    if (!songOutFriday) throw new Error('missing case');
    const dumb = {
      text: 'Great question. Here are some tips: post consistently, engage with your fans, and build your brand. Let me know if you need anything else.',
      toolCalls: [],
    };
    const checks = runHardChecks(songOutFriday, dumb);
    const failed = checks.filter(c => !c.ok).map(c => c.id);
    expect(failed).toEqual(
      expect.arrayContaining(['not_generic', 'grounding_0'])
    );
    expect(scoreCase(songOutFriday.id, checks, null).passed).toBe(false);
  });

  it('fails a reply the persist gate swapped for the fallback', () => {
    if (!songOutFriday) throw new Error('missing case');
    const checks = runHardChecks(songOutFriday, {
      text: 'Night Swim is out Friday, in 2 days.',
      toolCalls: [],
      persistedAsFallback: true,
    });
    expect(checks.find(c => c.id === 'copy_floor')?.ok).toBe(false);
  });

  it('passes a grounded, specific reply', () => {
    if (!songOutFriday) throw new Error('missing case');
    const good = {
      text: 'Night Swim is out Friday, in 2 days. Editorial pitching needs weeks, so skip it. Today: put the Night Swim pre-save at the top of jov.ie/lunawaves and swap your Instagram bio link to it, since Instagram sends most of your visits.',
      toolCalls: [],
    };
    const checks = runHardChecks(songOutFriday, good);
    expect(checks.every(c => c.ok)).toBe(true);
    expect(scoreCase(songOutFriday.id, checks, null).score).toBe(100);
  });
});

describe('judge contract', () => {
  it('builds a prompt with the rubric, facts and tool results', () => {
    if (!songOutFriday) throw new Error('missing case');
    const prompt = buildJudgePrompt({
      testCase: songOutFriday,
      fixture: buildFixture('established', NOW),
      today: '2026-10-28',
      reply: {
        text: 'x',
        toolCalls: [{ name: 'showTopInsights', input: {}, output: { a: 1 } }],
      },
    });
    for (const b of HELPFULNESS_BEHAVIORS) expect(prompt).toContain(b.id);
    expect(prompt).toContain('Night Swim');
    expect(prompt).toContain('showTopInsights({}) -> {"a":1}');
  });

  it('parses verdicts, drops unknown values and excludes null behaviors', () => {
    const verdict = parseJudgeVerdict(
      'thinking... {"scores":{"grounded":2,"next_action":1,"time_aware":null,"no_dead_end":2,"specific":7,"concise":2,"truthful":0},"why":"x"}'
    );
    expect(verdict?.scores.specific).toBeNull();
    expect(judgeScore(verdict?.scores ?? {})).toBe(70);
    expect(parseJudgeVerdict('no json here')).toBeNull();
  });

  it('caps the score of a case that fails a hard check', () => {
    const verdict = parseJudgeVerdict(
      '{"scores":{"grounded":2,"next_action":2},"why":""}'
    );
    const result = scoreCase('x', [{ id: 'copy_floor', ok: false }], verdict);
    expect(result.score).toBe(40);
    expect(result.passed).toBe(false);
  });
});
