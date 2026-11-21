/** Deterministic helpfulness CI: case set, hard checks, judge parsing. No model/DB/network. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import calibration from './calibration.json';
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

function calibrationReply(id: string): string {
  const example = calibration.examples.find(e => e.id === id);
  if (!example) throw new Error(`missing calibration example: ${id}`);
  return example.reply.text;
}

describe('helpfulness case set', () => {
  it('is versioned, unique and within the per-run cap', () => {
    expect(HELPFULNESS_EVAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    const ids = HELPFULNESS_CASES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(120);
    expect(HELPFULNESS_CASES.filter(c => c.ciSubset).length).toBeGreaterThan(4);
  });

  it('covers every fixture and states what a great reply does', () => {
    const fixtures = new Set(HELPFULNESS_CASES.map(c => c.fixture));
    expect(fixtures).toEqual(new Set(['established', 'new', 'lapsed']));
    for (const c of HELPFULNESS_CASES)
      expect(c.great.length).toBeGreaterThan(20);
  });

  it('meets the fan-reply draft quota (≥10)', () => {
    expect(
      HELPFULNESS_CASES.filter(c => c.id.startsWith('fan-reply-')).length
    ).toBeGreaterThanOrEqual(10);
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
    const checks = runHardChecks(songOutFriday, good, {
      facts: buildFixture('established', NOW).facts,
    });
    expect(checks.every(c => c.ok)).toBe(true);
    expect(scoreCase(songOutFriday.id, checks, null).score).toBe(100);
  });

  it('draft-hold: fails claimed send, passes held fan-reply', () => {
    const fanReply = HELPFULNESS_CASES.find(c => c.id === 'fan-reply-dm');
    if (!fanReply) throw new Error('missing fan-reply-dm');
    expect(
      runHardChecks(fanReply, {
        text: 'I sent the DM for you: Night Swim drops Friday.',
        toolCalls: [],
      }).find(c => c.id === 'draft_hold')?.ok
    ).toBe(false);
    expect(
      runHardChecks(fanReply, {
        text: 'Draft for your yes: "Night Swim is out Friday." Nothing sent until you say yes.',
        toolCalls: [],
      }).every(c => c.ok)
    ).toBe(true);
  });

  it('hard-fails inventing-stats on the lapsed-flopped deliberate red', () => {
    const lapsed = HELPFULNESS_CASES.find(c => c.id === 'lapsed-flopped');
    if (!lapsed) throw new Error('missing case');
    const checks = runHardChecks(lapsed, {
      text: calibrationReply('lapsed-flopped'),
      toolCalls: [],
    });
    expect(checks.find(c => c.id === 'inventing_stats')?.ok).toBe(false);
    expect(scoreCase(lapsed.id, checks, null).passed).toBe(false);
  });

  it('hard-fails question-not-a-move (one-rec) on clarifying closers', () => {
    if (!songOutFriday) throw new Error('missing case');
    for (const id of ['greeting', 'followup-do-it', 'collab'] as const) {
      const checks = runHardChecks(songOutFriday, {
        text: calibrationReply(id),
        toolCalls: [],
      });
      expect(checks.find(c => c.id === 'question_not_a_move')?.ok, id).toBe(
        false
      );
      expect(scoreCase(songOutFriday.id, checks, null).passed, id).toBe(false);
    }
  });

  it('flags upcoming-first miss when case context has UPCOMING', () => {
    if (!songOutFriday) throw new Error('missing case');
    const facts = buildFixture('established', NOW).facts;
    expect(facts.some(f => f.includes('UPCOMING:'))).toBe(true);
    const checks = runHardChecks(
      songOutFriday,
      {
        text: calibrationReply('greeting'),
        toolCalls: [],
      },
      { facts }
    );
    expect(checks.find(c => c.id === 'upcoming_first')?.ok).toBe(false);
    expect(scoreCase(songOutFriday.id, checks, null).passed).toBe(false);
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

describe('ASS-36 empty-profile setup', () => {
  it('requires today setup step', () => {
    const c = HELPFULNESS_CASES.find(x => x.id === 'new-where-start')!;
    const bad = runHardChecks(c, {
      text: 'Finish a song first.',
      toolCalls: [],
    });
    const good = runHardChecks(c, {
      text: 'Add a bio on jov.ie/maraquill today.',
      toolCalls: [],
    });
    expect(bad.find(x => x.id === 'grounding_0')?.ok).toBe(false);
    expect(good.find(x => x.id === 'grounding_0')?.ok).toBe(true);
  });
});
