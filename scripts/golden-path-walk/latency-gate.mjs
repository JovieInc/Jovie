// Golden-path chat latency gate (Tim 2026-11-02): first visible answer within
// 2 s on every non-build turn. Ratchet: report-only until RATCHET_PASSES
// consecutive passing walks, then enforcing for good.
// ponytail: history is a local JSONL beside the cert evidence; move it to the
// Ovie certification ledger when a reader exists.

export const TARGET_MS = 2000;
export const RATCHET_PASSES = 3;

/** Nearest-rank percentile; null samples (no answer within the wait) count as Infinity. */
export function percentile(samples, p) {
  const sorted = samples
    .map(v => v ?? Number.POSITIVE_INFINITY)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** @param {{ firstVisibleMs: number | null, build?: boolean }[]} turns */
export function judgeWalk(turns) {
  const timed = turns.filter(t => !t.build).map(t => t.firstVisibleMs);
  const p50 = percentile(timed, 50);
  const p95 = percentile(timed, 95);
  return {
    n: timed.length,
    p50,
    p95,
    pass: timed.length > 0 && p95 <= TARGET_MS,
  };
}

/** @param {{ pass: boolean }[]} history oldest first */
export function gateMode(history) {
  let streak = 0;
  for (const row of history) {
    streak = row.pass ? streak + 1 : 0;
    if (streak >= RATCHET_PASSES) return 'enforce';
  }
  return 'report';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { appendFileSync, existsSync, readFileSync } = await import('node:fs');
  const [latencyPath, historyPath] = process.argv.slice(2);
  const verdict = judgeWalk(JSON.parse(readFileSync(latencyPath, 'utf8')));
  const history = existsSync(historyPath)
    ? readFileSync(historyPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l))
    : [];
  const mode = gateMode(history);
  appendFileSync(
    historyPath,
    `${JSON.stringify({ at: new Date().toISOString(), ...verdict })}\n`
  );
  process.stdout.write(`${JSON.stringify({ mode, ...verdict })}\n`);
  process.exit(mode === 'enforce' && !verdict.pass ? 1 : 0);
}
