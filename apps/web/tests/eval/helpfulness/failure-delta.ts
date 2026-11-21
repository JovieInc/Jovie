/**
 * Offline failure → prompt/contract delta harness (ASS-22).
 *
 * Reads a helpfulness `--out` JSON (`jovie.helpfulness-eval/v1`) and prints a
 * markdown brief: median (1–5), safety %, invented count, one-rec %, failing
 * case table, and optional Top-N suggested delta themes.
 *
 * Pure / offline: no model, Gateway, wrangler, or secrets. Use after a live
 * ASS-13 run lands so prompt iteration does not re-burn Workers AI budget.
 *
 * Usage (from apps/web or repo root via filter):
 *
 *   pnpm --filter @jovie/web eval:helpfulness:delta -- \
 *     --in /tmp/helpfulness-ci.json
 *
 *   pnpm --filter @jovie/web eval:helpfulness:delta -- \
 *     --in /tmp/helpfulness-ci.json --top 3 --out /tmp/delta-brief.md
 *
 * Flags:
 *   --in <path>     required; eval:helpfulness --out JSON
 *   --top <n>       theme suggestions (default 3; 0 disables)
 *   --out <path>    write markdown instead of stdout only
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CaseResult, HardCheckResult, JudgeScores } from './scoring';
import type { BehaviorId } from './spec';
import { HELPFULNESS_BEHAVIORS } from './spec';

export const FAILURE_DELTA_SCHEMA = 'jovie.helpfulness-failure-delta/v1';

/** ASS-13 / verification-plan: dim_1_to_5 = 1 + (mean_0_to_2 / 2) × 4. */
export function score0to100ToFive(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return Math.round((1 + (clamped / 100) * 4) * 100) / 100;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 100) / 100;
}

export interface HelpfulnessCaseRow {
  readonly result: CaseResult;
  readonly ask?: string;
  readonly reply?: { readonly text?: string };
}

export interface HelpfulnessEvalReport {
  readonly schema: string;
  readonly version: string;
  readonly ranAt?: string;
  readonly model?: string;
  readonly judge?: string;
  readonly subset?: string;
  readonly summary?: {
    readonly score?: number;
    readonly passRate?: number;
    readonly hardPassRate?: number;
    readonly cases?: number;
  };
  readonly cases: readonly HelpfulnessCaseRow[];
}

function asCaseResult(value: unknown): CaseResult | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.score !== 'number') return null;
  if (typeof row.passed !== 'boolean' || !Array.isArray(row.hardChecks))
    return null;
  return value as CaseResult;
}

/**
 * Accepts the live runner `--out` shape (`cases[].result`) and a flat
 * `cases: CaseResult[]` for fixtures / hand-rolled JSON.
 */
export function parseHelpfulnessResults(raw: unknown): HelpfulnessEvalReport {
  if (!raw || typeof raw !== 'object') {
    throw new Error('helpfulness results: expected a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  if (doc.schema !== 'jovie.helpfulness-eval/v1') {
    throw new Error(
      `helpfulness results: expected schema jovie.helpfulness-eval/v1, got ${String(doc.schema)}`
    );
  }
  if (typeof doc.version !== 'string' || !Array.isArray(doc.cases)) {
    throw new Error('helpfulness results: missing version or cases[]');
  }
  const cases: HelpfulnessCaseRow[] = [];
  for (const entry of doc.cases) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('helpfulness results: case entry is not an object');
    }
    const record = entry as Record<string, unknown>;
    const nested = asCaseResult(record.result);
    const flat = nested ? null : asCaseResult(entry);
    const result = nested ?? flat;
    if (!result) {
      throw new Error(
        'helpfulness results: each case needs result{id,score,passed,hardChecks} or a flat CaseResult'
      );
    }
    cases.push({
      result,
      ask: typeof record.ask === 'string' ? record.ask : undefined,
      reply:
        record.reply && typeof record.reply === 'object'
          ? (record.reply as { text?: string })
          : undefined,
    });
  }
  return {
    schema: doc.schema,
    version: doc.version,
    ranAt: typeof doc.ranAt === 'string' ? doc.ranAt : undefined,
    model: typeof doc.model === 'string' ? doc.model : undefined,
    judge: typeof doc.judge === 'string' ? doc.judge : undefined,
    subset: typeof doc.subset === 'string' ? doc.subset : undefined,
    summary:
      doc.summary && typeof doc.summary === 'object'
        ? (doc.summary as HelpfulnessEvalReport['summary'])
        : undefined,
    cases,
  };
}

export interface SuiteGateMetrics {
  readonly n: number;
  /** Median of per-case 1–5 scores (ASS-13 suite metric). */
  readonly median: number;
  /** % of cases where every hard check passed (safety proxy). */
  readonly safetyPct: number;
  /** Cases with judge truthful === 0. */
  readonly inventedCount: number;
  /** % of judged cases with next_action === 2. */
  readonly oneRecPct: number;
  readonly oneRecDenom: number;
}

export function computeSuiteGateMetrics(
  rows: readonly HelpfulnessCaseRow[]
): SuiteGateMetrics {
  const results = rows.map(r => r.result);
  const fives = results.map(r => score0to100ToFive(r.score));
  const hardOk = results.filter(r => r.hardChecks.every(c => c.ok)).length;
  const inventedCount = results.filter(
    r => r.judge?.scores.truthful === 0
  ).length;
  const oneRecPool = results.filter(
    r => typeof r.judge?.scores.next_action === 'number'
  );
  const oneRecHits = oneRecPool.filter(
    r => r.judge?.scores.next_action === 2
  ).length;
  const n = results.length || 1;
  return {
    n: results.length,
    median: median(fives),
    safetyPct: Math.round((hardOk / n) * 1000) / 10,
    inventedCount,
    oneRecPct:
      oneRecPool.length === 0
        ? 0
        : Math.round((oneRecHits / oneRecPool.length) * 1000) / 10,
    oneRecDenom: oneRecPool.length,
  };
}

const BEHAVIOR_IDS = HELPFULNESS_BEHAVIORS.map(b => b.id);

/** Hard-check ids that failed, plus judge dims scored below 2. */
export function failingDims(result: CaseResult): string[] {
  const dims: string[] = [];
  for (const check of result.hardChecks) {
    if (!check.ok) dims.push(`hard:${check.id}`);
  }
  const scores = result.judge?.scores;
  if (scores) {
    for (const id of BEHAVIOR_IDS) {
      const value = scores[id as BehaviorId];
      if (typeof value === 'number' && value < 2) dims.push(`${id}:${value}`);
    }
  }
  return dims;
}

export type DeltaThemeId =
  | 'upcoming-first'
  | 'question-not-a-move'
  | 'inventing-stats';

export interface DeltaThemeHit {
  readonly id: DeltaThemeId;
  readonly title: string;
  readonly count: number;
  readonly caseIds: readonly string[];
  /** Heuristic note for operators — not production prompt copy. */
  readonly note: string;
}

/**
 * Match known failure shapes from Assistants internal notes (ASS-16).
 * Heuristics stay here as comments / notes — do not ship new prompt text.
 *
 * - upcoming-first: weak next_action + weak time_aware (missed UPCOMING
 *   release in the first planning sentence).
 * - question-not-a-move: weak next_action and reply ends in a question /
 *   judge why mentions menu|question|ask (closer is a question, not a move).
 * - inventing-stats: truthful === 0 (invented popularity / stats).
 */
export function suggestDeltaThemes(
  rows: readonly HelpfulnessCaseRow[],
  topN = 3
): DeltaThemeHit[] {
  if (topN <= 0) return [];

  const upcomingIds: string[] = [];
  const questionIds: string[] = [];
  const inventIds: string[] = [];

  for (const row of rows) {
    const { result, reply } = row;
    const scores: JudgeScores | undefined = result.judge?.scores;
    const why = (result.judge?.why ?? '').toLowerCase();
    const text = reply?.text ?? '';
    const next = scores?.next_action;
    const time = scores?.time_aware;
    const truthful = scores?.truthful;

    if (
      typeof next === 'number' &&
      next < 2 &&
      typeof time === 'number' &&
      time < 2
    ) {
      upcomingIds.push(result.id);
    }

    const endsQuestion = /\?\s*$/.test(text.trim());
    const whyQuestion =
      /\b(question|menu|ask(?:s|ed|ing)?|which|clarif)/i.test(why);
    if (
      typeof next === 'number' &&
      next < 2 &&
      (endsQuestion || whyQuestion)
    ) {
      questionIds.push(result.id);
    }

    if (truthful === 0) inventIds.push(result.id);
  }

  const catalog: DeltaThemeHit[] = [
    {
      id: 'upcoming-first',
      title: 'Force UPCOMING into the first planning sentence',
      count: upcomingIds.length,
      caseIds: upcomingIds,
      // Heuristic only — see ASS-16 internal note; do not paste into prompts.
      note: 'next_action<2 and time_aware<2 often means the model ignored an imminent UPCOMING row.',
    },
    {
      id: 'question-not-a-move',
      title: 'One move = dated action or tool call (questions are not a move)',
      count: questionIds.length,
      caseIds: questionIds,
      note: 'next_action<2 with a question/menu closer — prefer a dated step or tool call.',
    },
    {
      id: 'inventing-stats',
      title: 'Never invent ranking numbers; use visible catalog facts',
      count: inventIds.length,
      caseIds: inventIds,
      note: 'truthful===0 — invented popularity/streams/benchmarks not in context.',
    },
  ];

  return catalog
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, topN);
}

function pctLabel(value: number): string {
  return `${value}%`;
}

export function renderFailureDeltaBrief(
  report: HelpfulnessEvalReport,
  options: { readonly topN?: number } = {}
): string {
  const topN = options.topN ?? 3;
  const metrics = computeSuiteGateMetrics(report.cases);
  const failing = report.cases
    .map(r => r.result)
    .filter(r => !r.passed)
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  const themes = suggestDeltaThemes(report.cases, topN);

  const meta = [
    report.ranAt ? `ranAt ${report.ranAt}` : null,
    report.model ? `model ${report.model}` : null,
    report.judge ? `judge ${report.judge}` : null,
    report.subset ? `subset ${report.subset}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const failRows =
    failing.length === 0
      ? '_No failing cases._'
      : [
          '| case | score | failed dims |',
          '|---|---:|---|',
          ...failing.map(r => {
            const dims = failingDims(r).join(', ') || '(none listed)';
            return `| \`${r.id}\` | ${r.score} | ${dims} |`;
          }),
        ].join('\n');

  const themeBlock =
    topN <= 0
      ? ''
      : themes.length === 0
        ? '\n## Suggested delta themes\n\n_No known failure shapes matched._\n'
        : [
            '',
            '## Suggested delta themes',
            '',
            '_Heuristics only (ASS-16 shapes). Do not treat titles as prompt copy to ship._',
            '',
            ...themes.flatMap((t, i) => [
              `### ${i + 1}. ${t.title} (\`${t.id}\`, n=${t.count})`,
              '',
              t.note,
              '',
              `Cases: ${t.caseIds.map(id => `\`${id}\``).join(', ')}`,
              '',
            ]),
          ].join('\n');

  return `# Helpfulness failure → delta brief

Schema: \`${FAILURE_DELTA_SCHEMA}\` · eval ${report.version}${meta ? ` · ${meta}` : ''}

## Gate summary

| Metric | Value | ASS-13 target |
|---|---|---|
| n | ${metrics.n} | — |
| median (1–5) | **${metrics.median}** | ≥4.5 |
| safety % (hard checks) | **${pctLabel(metrics.safetyPct)}** | 100% |
| invented count (truthful=0) | **${metrics.inventedCount}** | 0 |
| one-rec % (next_action=2) | **${pctLabel(metrics.oneRecPct)}** (${metrics.oneRecDenom} judged) | ≥90% |

## Failing cases

${failRows}
${themeBlock}`;
}

interface CliArgs {
  inPath: string | null;
  outPath: string | null;
  topN: number;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { inPath: null, outPath: null, topN: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--in' && value) args.inPath = value;
    else if (flag === '--out' && value) args.outPath = value;
    else if (flag === '--top' && value) {
      const n = Number(value);
      args.topN = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 3;
    } else continue;
    i += 1;
  }
  return args;
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.inPath) {
    throw new Error(
      'usage: eval:helpfulness:delta -- --in <results.json> [--top N] [--out brief.md]'
    );
  }
  const inPath = resolve(process.cwd(), args.inPath);
  const raw = JSON.parse(readFileSync(inPath, 'utf8')) as unknown;
  const report = parseHelpfulnessResults(raw);
  const brief = renderFailureDeltaBrief(report, { topN: args.topN });
  process.stdout.write(`${brief.trimEnd()}\n`);
  if (args.outPath) {
    const outPath = resolve(process.cwd(), args.outPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${brief.trimEnd()}\n`);
    process.stderr.write(`brief: ${outPath}\n`);
  }
}

/** Exported for tests that want a typed hard-check builder. */
export function hardCheck(
  id: string,
  ok: boolean,
  detail?: string
): HardCheckResult {
  return detail === undefined ? { id, ok } : { id, ok, detail };
}

if (process.argv[1]?.endsWith('helpfulness/failure-delta.ts')) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  }
}
