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
 * Soft adapter failures (missing creds / empty cohort). The win stays
 * pending-measure so a later run can retry — never partial-receipt.
 */
const SOFT_SKIP =
  /AI_GATEWAY_API_KEY is not set|no tag row for feature:|store not configured/i;

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
 * Receipts are atomic per win: only appended when every queryable metric on
 * that win succeeds. A partial success must not drop `pending-measure`, or
 * remaining metrics are permanently excluded from `dueMeasurements`.
 *
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

    /** @type {MeasureAction[]} */
    const winSkips = [];
    /** @type {Array<MeasureAction & { value: number, evidence: string }>} */
    const winMeasured = [];
    /** @type {MeasureAction[]} */
    const winErrors = [];

    for (const metric of win.metrics ?? []) {
      if (metric.before === null) continue;
      const classified = classifyMetric(metric);
      if (classified.adapter === 'needs-probe') {
        winSkips.push({
          id: win.id,
          metric: metric.name,
          adapter: 'needs-probe',
          reason: 'no v1 adapter for this source/query',
        });
        continue;
      }
      try {
        const result = await measureOne(metric, classified, opts);
        winMeasured.push({
          id: win.id,
          metric: metric.name,
          adapter: classified.adapter,
          value: result.value,
          evidence: result.evidence,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const row = {
          id: win.id,
          metric: metric.name,
          adapter: classified.adapter,
          reason,
        };
        if (SOFT_SKIP.test(reason)) winSkips.push(row);
        else winErrors.push(row);
      }
    }

    skipped.push(...winSkips);
    // Queryable metrics that soft-skipped or errored leave the win incomplete.
    // Do not append any receipts — winStatus must stay pending-measure.
    const queryableAttempted = winMeasured.length + winSkips.filter(
      s => s.adapter !== 'needs-probe'
    ).length + winErrors.length;
    const incomplete =
      winErrors.length > 0 ||
      winSkips.some(s => s.adapter !== 'needs-probe') ||
      (queryableAttempted > 0 && winMeasured.length < queryableAttempted);

    if (incomplete) {
      errors.push(...winErrors);
      // Soft skips already in `skipped`; drop buffered successes so the report
      // does not claim a receipt that was not persisted.
      continue;
    }

    measured.push(...winMeasured);
    if (!opts.dryRun && winMeasured.length) {
      win.receipts = win.receipts ?? [];
      for (const row of winMeasured) {
        win.receipts.push({
          metric: row.metric,
          value: row.value,
          at,
          evidence: row.evidence,
          sha,
        });
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
