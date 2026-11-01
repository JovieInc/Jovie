/**
 * Deterministic hard checks, judge prompt/parse and aggregate scoring for the
 * Jovie helpfulness eval. Pure: no model, DB or network.
 */

import { lintVoice } from '@/lib/chat/voice-lint';
import { DEFAULT_MAX_WORDS, type HelpfulnessCase } from './cases';
import type { EvalFixture } from './fixtures';
import {
  type BehaviorId,
  CASE_PASS_SCORE,
  HARD_FAIL_SCORE_CAP,
  HELPFULNESS_BEHAVIORS,
} from './spec';

export interface EvalToolCall {
  readonly name: string;
  readonly input: unknown;
  /** Stub output the model saw; the judge needs it to check grounding. */
  readonly output?: unknown;
}

export interface EvalReply {
  /** What the artist reads: the persisted reply, or the live stream when the
   * persisted copy was swapped for the fallback. */
  readonly text: string;
  readonly toolCalls: readonly EvalToolCall[];
  /** True when the persist gate replaced the reply with the fallback. */
  readonly persistedAsFallback?: boolean;
}

export interface HardCheckResult {
  readonly id: string;
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * Stock creator-economy advice that could be pasted into any artist's chat.
 * A hit is a hard fail: it is the clearest "dumb" signal.
 */
export const GENERIC_ADVICE_PATTERNS: readonly RegExp[] = [
  /\bconsisten(?:cy|t(?:ly)?)\b[^.]{0,40}\b(?:key|post|content)/i,
  /\bengage with your (?:fans|audience|followers)\b/i,
  /\bbuild (?:a|your) (?:strong )?(?:brand|fanbase|community)\b/i,
  /\bpost (?:regularly|consistently|more often)\b/i,
  /\bcollaborate with other artists\b/i,
  /\bleverage (?:social media|your)\b/i,
  /\bhere are (?:some|a few) (?:tips|ideas|ways|strategies)\b/i,
  /\bthere are (?:several|many|a few) (?:ways|things|strategies)\b/i,
  /\bit (?:really )?depends on\b/i,
  /\blet me know (?:if|how) (?:you|i)\b/i,
  /\bgreat question\b/i,
];

const EMOJI = /\p{Extended_Pictographic}/u;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function runHardChecks(
  testCase: HelpfulnessCase,
  reply: EvalReply
): HardCheckResult[] {
  const text = reply.text;
  const toolText = reply.toolCalls
    .map(call => `${call.name} ${JSON.stringify(call.input ?? {})}`)
    .join(' ');
  const haystack = `${text} ${toolText}`.toLowerCase();
  const checks: HardCheckResult[] = [];

  checks.push({
    id: 'non_empty',
    ok: text.trim().length > 0 || reply.toolCalls.length > 0,
  });

  const lint = lintVoice(text);
  const floorOk =
    reply.persistedAsFallback === undefined
      ? text.trim().length === 0 || lint.ok
      : !reply.persistedAsFallback;
  checks.push({
    id: 'copy_floor',
    ok: floorOk,
    detail: floorOk
      ? undefined
      : `persisted as fallback; rules: ${lint.violations.map(v => v.rule).join(', ')}`,
  });

  const generic = GENERIC_ADVICE_PATTERNS.find(pattern => pattern.test(text));
  checks.push({
    id: 'not_generic',
    ok: !generic,
    detail: generic ? `matched ${generic.source}` : undefined,
  });

  checks.push({ id: 'no_emoji', ok: !EMOJI.test(text) });

  const maxWords = testCase.maxWords ?? DEFAULT_MAX_WORDS;
  const words = countWords(text);
  checks.push({
    id: 'length',
    ok: words <= maxWords,
    detail: words > maxWords ? `${words} words > ${maxWords}` : undefined,
  });

  for (const [index, group] of (testCase.mustMentionAny ?? []).entries()) {
    const ok = group.some(token => haystack.includes(token.toLowerCase()));
    checks.push({
      id: `grounding_${index}`,
      ok,
      detail: ok ? undefined : `none of: ${group.join(' | ')}`,
    });
  }

  if (testCase.expectToolsAny && testCase.expectToolsAny.length > 0) {
    const called = reply.toolCalls.map(call => call.name);
    const ok = testCase.expectToolsAny.some(name => called.includes(name));
    checks.push({
      id: 'expected_tool',
      ok,
      detail: ok
        ? undefined
        : `wanted ${testCase.expectToolsAny.join(' | ')}, got ${called.join(', ') || 'none'}`,
    });
  }

  return checks;
}

export type JudgeScores = Partial<Record<BehaviorId, 0 | 1 | 2 | null>>;

export interface JudgeVerdict {
  readonly scores: JudgeScores;
  readonly why: string;
}

export function buildJudgePrompt(input: {
  readonly testCase: HelpfulnessCase;
  readonly fixture: EvalFixture;
  readonly today: string;
  readonly reply: EvalReply;
}): string {
  const rubric = HELPFULNESS_BEHAVIORS.map(
    b => `- ${b.id} (${b.title}). 2 = ${b.meets} 0 = ${b.fails}`
  ).join('\n');
  const history = (input.testCase.history ?? [])
    .map(turn => `${turn.role}: ${turn.text}`)
    .join('\n');
  const tools =
    input.reply.toolCalls.length > 0
      ? input.reply.toolCalls
          .map(
            call =>
              `${call.name}(${JSON.stringify(call.input ?? {})}) -> ${JSON.stringify(call.output ?? null).slice(0, 600)}`
          )
          .join('\n')
      : 'none';

  return `You grade replies from Jovie, an AI assistant for music artists, against a helpfulness rubric. Be strict: a reply that would be fine from a generic chatbot scores low.

Today is ${input.today}.

Facts Jovie had about this artist:
${input.fixture.facts.map(f => `- ${f}`).join('\n')}

Rubric. Score each behavior 0, 1 or 2. Use null only when the behavior truly cannot apply to this ask (time_aware for a timeless question; grounded when no artist fact bears on it).
${rubric}

What a great reply does here: ${input.testCase.great}
${history ? `\nEarlier turns:\n${history}\n` : ''}
Artist asked: ${input.testCase.ask}

Tool calls Jovie made, with the results it saw (facts in results count as grounded):
${tools}

Jovie's reply text:
<<<
${input.reply.text}
>>>

Return only JSON: {"scores":{"grounded":0|1|2|null,"next_action":...,"time_aware":...,"no_dead_end":...,"specific":...,"concise":...,"truthful":...},"why":"<one sentence naming the biggest gap>"}`;
}

const SCORE_KEYS = HELPFULNESS_BEHAVIORS.map(b => b.id);

export function parseJudgeVerdict(raw: string): JudgeVerdict | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as { scores?: Record<string, unknown>; why?: unknown };
  if (!record.scores || typeof record.scores !== 'object') return null;
  const scores: JudgeScores = {};
  for (const key of SCORE_KEYS) {
    const value = record.scores[key];
    if (value === 0 || value === 1 || value === 2) scores[key] = value;
    else scores[key] = null;
  }
  return { scores, why: typeof record.why === 'string' ? record.why : '' };
}

/** 0-100 from judge scores; null behaviors are excluded. */
export function judgeScore(scores: JudgeScores): number {
  const values = Object.values(scores).filter(
    (v): v is 0 | 1 | 2 => typeof v === 'number'
  );
  if (values.length === 0) return 0;
  const total = values.reduce<number>((sum, v) => sum + v, 0);
  return Math.round((total / (values.length * 2)) * 100);
}

export interface CaseResult {
  readonly id: string;
  readonly score: number;
  readonly passed: boolean;
  readonly hardChecks: readonly HardCheckResult[];
  readonly judge: JudgeVerdict | null;
}

export function scoreCase(
  id: string,
  hardChecks: readonly HardCheckResult[],
  judge: JudgeVerdict | null
): CaseResult {
  const hardOk = hardChecks.every(check => check.ok);
  // Without a judge, the hard checks alone decide (CI deterministic lane).
  const base = judge ? judgeScore(judge.scores) : hardOk ? 100 : 0;
  const score = hardOk ? base : Math.min(base, HARD_FAIL_SCORE_CAP);
  return {
    id,
    score,
    passed: hardOk && score >= CASE_PASS_SCORE,
    hardChecks,
    judge,
  };
}

export interface RunSummary {
  readonly score: number;
  readonly passRate: number;
  readonly hardPassRate: number;
  readonly behaviorMeans: Partial<Record<BehaviorId, number>>;
  readonly cases: number;
}

export function summarize(results: readonly CaseResult[]): RunSummary {
  const n = results.length || 1;
  const behaviorMeans: Partial<Record<BehaviorId, number>> = {};
  for (const key of SCORE_KEYS) {
    const values = results
      .map(r => r.judge?.scores[key])
      .filter((v): v is 0 | 1 | 2 => typeof v === 'number');
    if (values.length > 0) {
      behaviorMeans[key] =
        Math.round(
          (values.reduce<number>((s, v) => s + v, 0) / values.length / 2) * 100
        ) / 100;
    }
  }
  return {
    score: Math.round(results.reduce((s, r) => s + r.score, 0) / n),
    passRate:
      Math.round((results.filter(r => r.passed).length / n) * 100) / 100,
    hardPassRate:
      Math.round(
        (results.filter(r => r.hardChecks.every(c => c.ok)).length / n) * 100
      ) / 100,
    behaviorMeans,
    cases: results.length,
  };
}
