/**
 * Publishes a helpfulness run to gbrain as the tracked company metric that
 * Summer reads for the weekly read-out (page `metrics/jovie-helpfulness`).
 *
 * The page keeps a machine-readable history block so each publish appends a
 * row; the rest is a human summary. Fixtures are synthetic, so replies and
 * case ids carry no user data.
 */

export const HELPFULNESS_METRIC_SLUG = 'metrics/jovie-helpfulness';
const HISTORY_START = '<!-- helpfulness-history';
const HISTORY_END = '-->';
const MAX_HISTORY = 104;

export interface HelpfulnessRunRow {
  readonly ranAt: string;
  readonly version: string;
  readonly model: string;
  readonly judge: string;
  readonly subset: string;
  readonly score: number;
  readonly passRate: number;
  readonly hardPassRate: number;
  readonly behaviorMeans: Readonly<Record<string, number>>;
  readonly latencyP50Ms: number;
  readonly latencyP95Ms: number;
  readonly cases: number;
  readonly worst: readonly { id: string; score: number; why: string }[];
}

export function parseHistory(page: string): HelpfulnessRunRow[] {
  const start = page.indexOf(HISTORY_START);
  if (start < 0) return [];
  const end = page.indexOf(HISTORY_END, start);
  if (end < 0) return [];
  try {
    const rows = JSON.parse(
      page.slice(start + HISTORY_START.length, end).trim()
    ) as unknown;
    return Array.isArray(rows) ? (rows as HelpfulnessRunRow[]) : [];
  } catch {
    return [];
  }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function renderMetricPage(
  history: readonly HelpfulnessRunRow[]
): string {
  const rows = history.slice(-MAX_HISTORY);
  const latest = rows.at(-1);
  const comparable = rows.filter(
    r => latest && r.version === latest.version && r.judge === latest.judge
  );
  const previous = comparable.at(-2);
  const delta = latest && previous ? latest.score - previous.score : null;
  const trend = comparable
    .slice(-8)
    .map(
      r =>
        `| ${r.ranAt.slice(0, 10)} | ${r.score} | ${pct(r.passRate)} | ${pct(r.hardPassRate)} | ${r.model} | ${r.cases} |`
    )
    .join('\n');
  const behaviors = latest
    ? Object.entries(latest.behaviorMeans)
        .sort((a, b) => a[1] - b[1])
        .map(([id, v]) => `${id} ${v.toFixed(2)}`)
        .join(', ')
    : '';
  const worst = latest
    ? latest.worst.map(w => `- ${w.id} (${w.score}): ${w.why}`).join('\n')
    : '';

  return `# Jovie helpfulness (tracked metric)

Owner: Summer. Source: \`apps/web/tests/eval/helpfulness/run.ts\` in JovieInc/Jovie (synthetic artists, Workers AI only).
Target: score >= 85 and pass rate >= 85% on the current eval version. Compare runs only within one version and judge.

## Latest
${
  latest
    ? `- Run: ${latest.ranAt} (eval ${latest.version}, model ${latest.model}, judge ${latest.judge}, ${latest.subset}, n=${latest.cases})
- Score: **${latest.score}/100**${delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta} vs previous comparable run)`}, pass ${pct(latest.passRate)}, hard checks ${pct(latest.hardPassRate)}
- Latency p50 ${Math.round(latest.latencyP50Ms / 1000)}s, p95 ${Math.round(latest.latencyP95Ms / 1000)}s
- Weakest behaviors first: ${behaviors}

### Worst cases
${worst}`
    : 'No runs yet.'
}

## Trend (same version and judge)
| date | score | pass | hard checks | model | n |
|---|---|---|---|---|---|
${trend}

${HISTORY_START}
${JSON.stringify(rows)}
${HISTORY_END}
`;
}
