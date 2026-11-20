// Auto-measure due pending-measure wins with v1 adapters; skip the rest as needs-probe.
import { dueMeasurements, winStatus } from '../wins-ledger.mjs';
import {
  classifyMetric,
  isNeedsProbeWin,
  isQueryableWin,
} from './classify.mjs';
import { measureGatewayReport } from './gateway-report.mjs';
import { measureJsonFile } from './json-file.mjs';

/**
 * @typedef {{ metric: string, value: number, at: string, evidence: string, sha: string | null }} Receipt
 * @typedef {{
 *   id: string,
 *   metric: string,
 *   adapter: string,
 *   value?: number,
 *   evidence?: string,
 *   status?: string,
 *   reason?: string,
 * }} MeasureAction
 */

/**
 * Split due wins into queryable vs needs-probe (no measurement yet).
 * @param {object[]} wins
 * @param {number} [nowMs]
 * @param {number} [hours]
 */
export function dueMeasurePlan(wins, nowMs = Date.now(), hours = 24) {
  const due = dueMeasurements(wins, nowMs, hours);
  const queryable = due.filter(isQueryableWin);
  const needsProbe = due.filter(isNeedsProbeWin);
  const mixed = due.filter(w => !isQueryableWin(w) && !isNeedsProbeWin(w));
  return {
    due: due.map(w => w.id),
    queryable: queryable.map(w => w.id),
    needsProbe: needsProbe.map(w => ({
      id: w.id,
      metrics: (w.metrics ?? [])
        .filter(m => m.before !== null)
        .map(m => ({
          name: m.name,
          source: m.source,
          query: m.query,
          reason: 'no v1 adapter for this source/query',
        })),
    })),
    mixed: mixed.map(w => w.id),
  };
}

/**
 * @param {{ source?: string, query?: string, name?: string, unit?: string }} metric
 * @param {ReturnType<typeof classifyMetric>} classified
 * @param {{
 *   measureJson?: typeof measureJsonFile,
 *   measureGateway?: typeof measureGatewayReport,
 *   apiKey?: string,
 *   fetchImpl?: typeof fetch,
 *   at?: string,
 *   sha?: string | null,
 * }} [deps]
 */
async function measureOne(metric, classified, deps = {}) {
  if (classified.adapter === 'json-file') {
    const measure = deps.measureJson ?? measureJsonFile;
    return measure({ file: classified.file, path: classified.path });
  }
  if (classified.adapter === 'gateway-report') {
    const measure = deps.measureGateway ?? measureGatewayReport;
    return measure(
      { feature: classified.feature, field: classified.field },
      { apiKey: deps.apiKey, fetchImpl: deps.fetchImpl }
    );
  }
  throw new Error('needs-probe');
}

/**
 * Measure every due queryable win. Needs-probe dues are listed, not receipted.
 * Mutates `wins` in place when receipts are appended (caller persists).
 *
 * @param {object[]} wins
 * @param {{
 *   nowMs?: number,
 *   hours?: number,
 *   dryRun?: boolean,
 *   at?: string,
 *   sha?: string | null,
 *   measureJson?: typeof measureJsonFile,
 *   measureGateway?: typeof measureGatewayReport,
 *   apiKey?: string,
 *   fetchImpl?: typeof fetch,
 * }} [opts]
 */
export async function measureDueWins(wins, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const at = opts.at ?? new Date(nowMs).toISOString();
  const sha = opts.sha ?? null;
  const plan = dueMeasurePlan(wins, nowMs, opts.hours ?? 24);
  /** @type {MeasureAction[]} */
  const measured = [];
  /** @type {MeasureAction[]} */
  const skipped = [];
  /** @type {MeasureAction[]} */
  const errors = [];

  for (const skip of plan.needsProbe) {
    for (const m of skip.metrics)
      skipped.push({
        id: skip.id,
        metric: m.name,
        adapter: 'needs-probe',
        reason: m.reason,
      });
  }

  const dueIds = new Set(plan.due);
  for (const win of wins) {
    if (!dueIds.has(win.id)) continue;
    if (isNeedsProbeWin(win)) continue;
    for (const metric of win.metrics ?? []) {
      if (metric.before === null) continue;
      const classified = classifyMetric(metric);
      if (classified.adapter === 'needs-probe') {
        skipped.push({
          id: win.id,
          metric: metric.name,
          adapter: 'needs-probe',
          reason: 'no v1 adapter for this source/query',
        });
        continue;
      }
      try {
        const result = await measureOne(metric, classified, opts);
        measured.push({
          id: win.id,
          metric: metric.name,
          adapter: classified.adapter,
          value: result.value,
          evidence: result.evidence,
        });
        if (!opts.dryRun) {
          win.receipts = win.receipts ?? [];
          win.receipts.push({
            metric: metric.name,
            value: result.value,
            at,
            evidence: result.evidence,
            sha,
          });
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // Missing credentials / empty gateway cohorts are skips, not job failures.
        // Real parse/shape bugs stay in `errors` so --strict CI can fail closed.
        if (
          /AI_GATEWAY_API_KEY is not set|no tag row for feature:|store not configured/i.test(
            reason
          )
        ) {
          skipped.push({
            id: win.id,
            metric: metric.name,
            adapter: classified.adapter,
            reason,
          });
        } else {
          errors.push({
            id: win.id,
            metric: metric.name,
            adapter: classified.adapter,
            reason,
          });
        }
      }
    }
  }

  const statuses = Object.fromEntries(
    [...new Set(measured.map(m => m.id))].map(id => {
      const win = wins.find(w => w.id === id);
      return [id, win ? winStatus(win) : 'unknown'];
    })
  );

  return {
    at,
    plan,
    measured,
    skipped,
    errors,
    statuses,
    dryRun: Boolean(opts.dryRun),
  };
}
