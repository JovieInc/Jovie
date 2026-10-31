/**
 * Shared agent tooling health (Tim 2026-10-28: gbrain, research router, MCPs and
 * CLIs every agent depends on must be healthy, fast and measured).
 *
 * Pure half: the inventory is declared once in canon/automation-registry.jsonl
 * (entry `mac:tooling-health`, field `tools`: tool, owner, probe, cost). This module
 * turns probe results into per-tool p50/p95, last-good and an alert decision.
 * Alerts go through the existing remediation intake (Linear P0 -> Summer's red queue).
 */

export const TOOLING_SCHEMA = 'jovie-tooling-health/v1';
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const ALERT_AFTER_RED = 2;

export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, index)];
}

/** history: [{at, tool, ok, ms}] -> per-tool rollup over the last 24h. */
export function rollup(history, now = Date.now()) {
  const byTool = new Map();
  for (const row of history) {
    const t = Date.parse(row.at);
    if (!Number.isFinite(t)) continue;
    const entry = byTool.get(row.tool) ?? { runs: [], lastGood: null };
    if (row.ok && (!entry.lastGood || t > Date.parse(entry.lastGood)))
      entry.lastGood = row.at;
    if (now - t <= WINDOW_MS) entry.runs.push(row);
    byTool.set(row.tool, entry);
  }
  const out = {};
  for (const [tool, { runs, lastGood }] of byTool) {
    const ms = runs.filter(r => r.ok).map(r => r.ms);
    out[tool] = {
      runs24h: runs.length,
      okPct24h: runs.length
        ? Math.round((100 * runs.filter(r => r.ok).length) / runs.length)
        : null,
      p50Ms: percentile(ms, 50),
      p95Ms: percentile(ms, 95),
      lastGood,
    };
  }
  return out;
}

/** Consecutive red results at the tail of one tool's history. */
export function consecutiveRed(history, tool) {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].tool !== tool) continue;
    if (history[i].ok) break;
    n++;
  }
  return n;
}

export function alertAction({ red, previousRed, pendingRecovery = false }) {
  if (red >= ALERT_AFTER_RED) return 'red';
  if (red === 0 && (previousRed >= ALERT_AFTER_RED || pendingRecovery))
    return 'green';
  return 'none';
}

/** Validate the registry `tools` inventory shape. */
export function validateTools(tools = []) {
  const errors = [];
  for (const [i, t] of tools.entries()) {
    for (const f of ['tool', 'owner', 'probe', 'cost'])
      if (typeof t?.[f] !== 'string' || !t[f].trim())
        errors.push(`tools[${i}].${f} required`);
  }
  return errors;
}
