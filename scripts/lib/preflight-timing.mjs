/**
 * Per-guard wall-time measurement for `pnpm preflight:changed`.
 * Writes (1) a JSON timing file for the run, (2) a JSONL history row, and
 * (3) jovie-stage-event/v1 rows for the `shipping` entity, stage
 * `prepush-preflight` (docs/metrics/stage-manifest.json), so p50/p95 per
 * guard and per run can be tracked and driven down.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

/** Per-guard p50/p95/n over history rows ({guards:[{id,ms}]}). */
export function summarize(rows) {
  const by = new Map();
  for (const row of rows)
    for (const g of row.guards ?? []) {
      if (!by.has(g.id)) by.set(g.id, []);
      by.get(g.id).push(g.ms);
    }
  return [...by].map(([id, ms]) => ({
    id,
    n: ms.length,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
  }));
}

/**
 * @param {{dir:string, file?:string, run:object}} opts
 * run: {head, scope, totalMs, waitedMs, guards:[{id,ms,status}], deferred:string[]}
 */
export function recordTimings({ dir, file, run }) {
  mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  const row = { schema: 'jovie-preflight-timing/v1', at, ...run };
  writeFileSync(
    file ?? path.join(dir, 'preflight-timings-latest.json'),
    `${JSON.stringify(row, null, 2)}\n`
  );
  appendFileSync(
    path.join(dir, 'preflight-timings.jsonl'),
    `${JSON.stringify(row)}\n`
  );
  const exited = new Date().toISOString();
  const entered = new Date(Date.parse(exited) - run.totalMs).toISOString();
  appendFileSync(
    path.join(dir, 'preflight-stages.jsonl'),
    `${JSON.stringify({
      schema: 'jovie-stage-event/v1',
      entityType: 'shipping',
      entityId: run.head,
      stage: 'prepush-preflight',
      enteredAt: entered,
      exitedAt: exited,
      actor: run.host ?? null,
      outcome: run.outcome ?? 'completed',
      sourceReceipt: `preflight-timings.jsonl#${run.head}`,
    })}\n`
  );
  return row;
}
