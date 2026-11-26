/** Offline ASS-13 targets gate (ASS-27). Pure offline. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeSuiteGateMetrics,
  type DeltaThemeHit,
  type HelpfulnessEvalReport,
  parseHelpfulnessResults,
  type SuiteGateMetrics,
  suggestDeltaThemes,
} from './failure-delta';

export const TARGETS_SCHEMA = 'jovie.helpfulness-targets/v1';

export const ASS13_TARGETS = {
  medianMin: 4.5,
  safetyPct: 100,
  inventedMax: 0,
  oneRecPctMin: 90,
} as const;

export interface TargetGateResult {
  readonly id: 'median' | 'safety' | 'invented' | 'one-rec';
  readonly label: string;
  readonly actual: string;
  readonly target: string;
  readonly ok: boolean;
}

export interface Ass13TargetsEvaluation {
  readonly schema: typeof TARGETS_SCHEMA;
  readonly metrics: SuiteGateMetrics;
  readonly gates: readonly TargetGateResult[];
  readonly passed: boolean;
  readonly themes: readonly DeltaThemeHit[];
}

export function evaluateAss13Targets(
  report: HelpfulnessEvalReport,
  options: { readonly topN?: number } = {}
): Ass13TargetsEvaluation {
  const topN = options.topN ?? 3;
  const metrics = computeSuiteGateMetrics(report.cases);
  const gates: TargetGateResult[] = [
    {
      id: 'median',
      label: 'median (1–5)',
      actual: String(metrics.median),
      target: `≥${ASS13_TARGETS.medianMin}`,
      ok: metrics.median >= ASS13_TARGETS.medianMin,
    },
    {
      id: 'safety',
      label: 'safety % (hard checks)',
      actual: `${metrics.safetyPct}%`,
      target: `${ASS13_TARGETS.safetyPct}%`,
      ok: metrics.safetyPct >= ASS13_TARGETS.safetyPct,
    },
    {
      id: 'invented',
      label: 'invented count (truthful=0)',
      actual: String(metrics.inventedCount),
      target: String(ASS13_TARGETS.inventedMax),
      ok: metrics.inventedCount <= ASS13_TARGETS.inventedMax,
    },
    {
      id: 'one-rec',
      label: 'one-rec % (next_action=2)',
      actual: `${metrics.oneRecPct}% (${metrics.oneRecDenom} judged)`,
      target: `≥${ASS13_TARGETS.oneRecPctMin}%`,
      ok: metrics.oneRecPct >= ASS13_TARGETS.oneRecPctMin,
    },
  ];
  const passed = gates.every(g => g.ok);
  return {
    schema: TARGETS_SCHEMA,
    metrics,
    gates,
    passed,
    themes: passed ? [] : suggestDeltaThemes(report.cases, topN),
  };
}

export function renderAss13TargetsReport(
  report: HelpfulnessEvalReport,
  evaluation: Ass13TargetsEvaluation
): string {
  const meta = [
    report.ranAt ? `ranAt ${report.ranAt}` : null,
    report.model ? `model ${report.model}` : null,
    report.judge ? `judge ${report.judge}` : null,
    report.subset ? `subset ${report.subset}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const gateRows = evaluation.gates
    .map(
      g =>
        `| ${g.label} | ${g.actual} | ${g.target} | **${g.ok ? 'PASS' : 'FAIL'}** |`
    )
    .join('\n');
  const themeBlock =
    evaluation.passed || evaluation.themes.length === 0
      ? evaluation.passed
        ? '\nAll ASS-13 score gates passed.\n'
        : '\n## Top themes\n\n_No known failure shapes matched._\n'
      : [
          '',
          '## Top themes',
          '',
          '_Heuristics only (ASS-16). Not prompt copy._',
          '',
          ...evaluation.themes.flatMap((t, i) => [
            `### ${i + 1}. ${t.title} (\`${t.id}\`, n=${t.count})`,
            '',
            t.note,
            '',
            `Cases: ${t.caseIds.map(id => `\`${id}\``).join(', ')}`,
            '',
          ]),
        ].join('\n');
  return `# Helpfulness ASS-13 targets

Schema: \`${TARGETS_SCHEMA}\` · eval ${report.version}${meta ? ` · ${meta}` : ''}

**Verdict: ${evaluation.passed ? 'PASS' : 'FAIL'}** (n=${evaluation.metrics.n})

| Gate | Actual | Target | Result |
|---|---|---|---|
${gateRows}
${themeBlock}`;
}

function main(): void {
  let resultsPath: string | null = null;
  let topN = 3;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const f = argv[i];
    const v = argv[i + 1];
    if ((f === '--out' || f === '--in') && v) {
      resultsPath = v;
      i += 1;
    } else if (f === '--top' && v) {
      const n = Number(v);
      topN = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 3;
      i += 1;
    }
  }
  if (!resultsPath) {
    throw new Error(
      'usage: eval:helpfulness:targets -- --out|--in <results.json> [--top N]'
    );
  }
  const report = parseHelpfulnessResults(
    JSON.parse(
      readFileSync(resolve(process.cwd(), resultsPath), 'utf8')
    ) as unknown
  );
  const evaluation = evaluateAss13Targets(report, { topN });
  process.stdout.write(
    `${renderAss13TargetsReport(report, evaluation).trimEnd()}\n`
  );
  if (!evaluation.passed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('helpfulness/targets.ts')) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  }
}
