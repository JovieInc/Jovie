/** Offline failure→delta (ASS-22). Pure offline. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CaseResult, JudgeScores } from './scoring';
import type { BehaviorId } from './spec';
import { HELPFULNESS_BEHAVIORS } from './spec';

export const FAILURE_DELTA_SCHEMA = 'jovie.helpfulness-failure-delta/v1';

export function score0to100ToFive(score: number): number {
  const c = Math.max(0, Math.min(100, score));
  return Math.round((1 + (c / 100) * 4) * 100) / 100;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const hi = s[m];
  if (hi === undefined) return 0;
  if (s.length % 2 === 1) return hi;
  const lo = s[m - 1];
  return lo === undefined ? hi : Math.round(((lo + hi) / 2) * 100) / 100;
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

/** Accepts `cases[].result` or flat CaseResult[]. */
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
    const result = asCaseResult(record.result) ?? asCaseResult(entry);
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
  readonly median: number;
  readonly safetyPct: number;
  readonly inventedCount: number;
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
  readonly note: string;
}

/** ASS-16 failure shapes — heuristics only; not prompt copy. */
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
    if (
      typeof next === 'number' &&
      next < 2 &&
      typeof time === 'number' &&
      time < 2
    ) {
      upcomingIds.push(result.id);
    }
    const endsQuestion = /\?\s*$/.test(text.trim());
    const whyQuestion = /\b(question|menu|ask(?:s|ed|ing)?|which|clarif)/i.test(
      why
    );
    if (typeof next === 'number' && next < 2 && (endsQuestion || whyQuestion)) {
      questionIds.push(result.id);
    }
    if (scores?.truthful === 0) inventIds.push(result.id);
  }
  return (
    [
      {
        id: 'upcoming-first' as const,
        title: 'UPCOMING in first planning sentence',
        count: upcomingIds.length,
        caseIds: upcomingIds,
        note: 'next_action<2 + time_aware<2 → missed imminent UPCOMING.',
      },
      {
        id: 'question-not-a-move' as const,
        title: 'One move = dated action/tool (not a question)',
        count: questionIds.length,
        caseIds: questionIds,
        note: 'next_action<2 with question/menu closer.',
      },
      {
        id: 'inventing-stats' as const,
        title: 'No invented ranking numbers; catalog facts only',
        count: inventIds.length,
        caseIds: inventIds,
        note: 'truthful===0 — invented popularity/stats/algorithm/lore.',
      },
    ] as const
  )
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, topN);
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
            '_Heuristics only (ASS-16). Not prompt copy._',
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
| safety % (hard checks) | **${metrics.safetyPct}%** | 100% |
| invented count (truthful=0) | **${metrics.inventedCount}** | 0 |
| one-rec % (next_action=2) | **${metrics.oneRecPct}%** (${metrics.oneRecDenom} judged) | ≥90% |

## Failing cases

${failRows}
${themeBlock}`;
}

function main(): void {
  let inPath: string | null = null;
  let outPath: string | null = null;
  let topN = 3;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const f = argv[i];
    const v = argv[i + 1];
    if (f === '--in' && v) inPath = v;
    else if (f === '--out' && v) outPath = v;
    else if (f === '--top' && v) {
      const n = Number(v);
      topN = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 3;
    } else continue;
    i += 1;
  }
  if (!inPath) {
    throw new Error(
      'usage: eval:helpfulness:delta -- --in <results.json> [--top N] [--out brief.md]'
    );
  }
  const resolved = resolve(process.cwd(), inPath);
  const report = parseHelpfulnessResults(
    JSON.parse(readFileSync(resolved, 'utf8')) as unknown
  );
  const brief = renderFailureDeltaBrief(report, { topN });
  process.stdout.write(`${brief.trimEnd()}\n`);
  if (outPath) {
    const out = resolve(process.cwd(), outPath);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${brief.trimEnd()}\n`);
    process.stderr.write(`brief: ${out}\n`);
  }
}

if (process.argv[1]?.endsWith('helpfulness/failure-delta.ts')) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  }
}
