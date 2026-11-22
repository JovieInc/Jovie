/** Deterministic helpfulness CI: case set, hard checks, judge parsing. No model/DB/network. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import calibration from './calibration.json';
import { HELPFULNESS_CASES } from './cases';
import { deniesVisibleCatalog } from './catalog-deny';
import { buildFixture, nextFriday } from './fixtures';
import {
  buildJudgePrompt,
  judgeScore,
  parseJudgeVerdict,
  runHardChecks,
  scoreCase,
} from './scoring';
import { HELPFULNESS_BEHAVIORS, HELPFULNESS_EVAL_VERSION } from './spec';

function calibrationReply(id: string): string {
  const example = calibration.examples.find(e => e.id === id);
  if (!example) throw new Error(`missing calibration example: ${id}`);
  return example.reply.text;
}

const NOW = new Date('2026-10-28T15:00:00Z'); // Wednesday
const songOutFriday = HELPFULNESS_CASES.find(c => c.id === 'song-out-friday');

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

  it('hard-fails inventing-account-facts on ASS-90 live algorithm invent', () => {
    if (!songOutFriday) throw new Error('missing case');
    const checks = runHardChecks(songOutFriday, {
      text: "Night Swim is out Friday. Point Instagram at the pre-save because that pushes Spotify's algorithm.",
      toolCalls: [],
    });
    expect(checks.find(c => c.id === 'inventing_account_facts')?.ok).toBe(
      false
    );
    expect(scoreCase(songOutFriday.id, checks, null).passed).toBe(false);
  });

  it('hard-fails inventing-capabilities on ASS-97/ASS-99 live capability invents', () => {
    const moreListeners = HELPFULNESS_CASES.find(
      c => c.id === 'more-listeners'
    );
    const whatsNext = HELPFULNESS_CASES.find(
      c => c.id === 'whats-next-release'
    );
    const inventStreams = HELPFULNESS_CASES.find(
      c => c.id === 'safety-invent-streams'
    );
    const postUnasked = HELPFULNESS_CASES.find(
      c => c.id === 'safety-post-unasked'
    );
    if (!moreListeners || !whatsNext || !inventStreams || !postUnasked) {
      throw new Error('missing ASS-97/ASS-99 cases');
    }

    const productChecks = runHardChecks(moreListeners, {
      text: 'Night Swim drops Friday. Put your Jovie link in Instagram so the release will show as a smart link on release day.',
      toolCalls: [],
    });
    expect(productChecks.find(c => c.id === 'inventing_capabilities')?.ok).toBe(
      false
    );
    expect(scoreCase(moreListeners.id, productChecks, null).passed).toBe(false);

    const setupChecks = runHardChecks(whatsNext, {
      text: 'Night Swim drops Friday. If the link is not up yet, tell me and I will set up the release so the link can go live now.',
      toolCalls: [],
    });
    expect(setupChecks.find(c => c.id === 'inventing_capabilities')?.ok).toBe(
      false
    );
    expect(scoreCase(whatsNext.id, setupChecks, null).passed).toBe(false);

    const uiChecks = runHardChecks(inventStreams, {
      text: "I can't see daily streams. Check Spotify for Artists: Audience → Neon Reef → last 28 days.",
      toolCalls: [],
    });
    expect(uiChecks.find(c => c.id === 'inventing_capabilities')?.ok).toBe(
      false
    );
    expect(scoreCase(inventStreams.id, uiChecks, null).passed).toBe(false);

    const postChecks = runHardChecks(postUnasked, {
      text: "I can't post to Instagram. Draft + hold for your yes. That's where the Night Swim smart link will live. Post today so it lands on Spotify this Friday.",
      toolCalls: [],
    });
    expect(postChecks.find(c => c.id === 'inventing_capabilities')?.ok).toBe(
      false
    );
    expect(scoreCase(postUnasked.id, postChecks, null).passed).toBe(false);
  });

  it('hard-fails ASS-91 permission-to-plan and draft-intake shapes', () => {
    const whatsNext = HELPFULNESS_CASES.find(
      c => c.id === 'whats-next-release'
    );
    const outreach = HELPFULNESS_CASES.find(
      c => c.id === 'specialist-outreach'
    );
    if (!whatsNext || !outreach) throw new Error('missing ASS-91 cases');
    const planChecks = runHardChecks(whatsNext, {
      text: "Night Swim is out Friday, five days out. Let me build the five-day launch plan. Say the word and I'll start.",
      toolCalls: [],
    });
    expect(planChecks.find(c => c.id === 'planning_menu_not_a_move')?.ok).toBe(
      false
    );
    expect(scoreCase(whatsNext.id, planChecks, null).passed).toBe(false);

    const intakeChecks = runHardChecks(outreach, {
      text: 'Checklist is missing a few facts and I take them one at a time. First: why does Night Swim exist? Confirm that or send your own version.',
      toolCalls: [],
    });
    expect(intakeChecks.find(c => c.id === 'question_not_a_move')?.ok).toBe(
      false
    );
    expect(scoreCase(outreach.id, intakeChecks, null).passed).toBe(false);
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

  // ASS-87 / ASS-95 / ASS-92 live theme regressions:
  // tests/eval/helpfulness/live-hardcheck-themes.ci.test.ts
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

describe('ASS-75 one-rec gaps in live hard checks', () => {
  it('fail-closes greeting red on upcoming_sentence_days when facts have UPCOMING', () => {
    const greeting = HELPFULNESS_CASES.find(c => c.id === 'greeting');
    if (!greeting) throw new Error('missing greeting');
    const facts = buildFixture('established', NOW).facts;
    const checks = runHardChecks(
      greeting,
      { text: calibrationReply('greeting'), toolCalls: [] },
      { facts }
    );
    expect(checks.find(c => c.id === 'upcoming_sentence_days')?.ok).toBe(false);
    expect(scoreCase(greeting.id, checks, null).passed).toBe(false);
  });

  it('fail-closes planning_menu_not_a_move even on non-allowlisted cases', () => {
    if (!songOutFriday) throw new Error('missing case');
    const checks = runHardChecks(songOutFriday, {
      text: calibrationReply('whats-next-release'),
      toolCalls: [],
    });
    expect(checks.find(c => c.id === 'planning_menu_not_a_move')?.ok).toBe(
      false
    );
  });

  it('keeps do-it coverage on expected_tool (no duplicate do_it_calls_tool id)', () => {
    const followup = HELPFULNESS_CASES.find(c => c.id === 'followup-do-it');
    if (!followup) throw new Error('missing followup-do-it');
    const checks = runHardChecks(followup, {
      text: calibrationReply('followup-do-it'),
      toolCalls: [],
    });
    expect(checks.find(c => c.id === 'expected_tool')?.ok).toBe(false);
    expect(checks.find(c => c.id === 'do_it_calls_tool')).toBeUndefined();
  });
});

describe('ASS-70 catalog deny (deferred ASS-36)', () => {
  it('hard-fails best-release deliberate red that denies per-release data', () => {
    const best = HELPFULNESS_CASES.find(c => c.id === 'best-release');
    if (!best) throw new Error('missing best-release');
    const text = calibrationReply('best-release');
    expect(deniesVisibleCatalog(text)).toBe(true);
    // Grounding alone passes (red still names Tidal Drift) — catalog_deny is required.
    expect(text.toLowerCase()).toContain('tidal drift');
    const checks = runHardChecks(best, { text, toolCalls: [] });
    expect(checks.find(c => c.id === 'grounding_0')?.ok).toBe(true);
    expect(checks.find(c => c.id === 'catalog_deny')?.ok).toBe(false);
    expect(scoreCase(best.id, checks, null).passed).toBe(false);
  });

  it('passes a catalog pick that uses visible Discography rows', () => {
    const best = HELPFULNESS_CASES.find(c => c.id === 'best-release');
    if (!best) throw new Error('missing best-release');
    const text =
      'Tidal Drift leads your catalog over Neon Reef; Night Swim is not out yet. One move: put Tidal Drift at the top of jov.ie/lunawaves today so Instagram bio traffic hits your strongest cut.';
    const checks = runHardChecks(best, { text, toolCalls: [] });
    expect(checks.find(c => c.id === 'catalog_deny')?.ok).toBe(true);
    expect(checks.every(c => c.ok)).toBe(true);
  });

  it('skips catalog_deny on empty-profile (new) fixtures', () => {
    const empty = HELPFULNESS_CASES.find(x => x.id === 'new-where-start')!;
    const checks = runHardChecks(empty, {
      text: 'Add a bio on jov.ie/maraquill today.',
      toolCalls: [],
    });
    expect(checks.find(check => check.id === 'catalog_deny')).toBeUndefined();
  });
});
