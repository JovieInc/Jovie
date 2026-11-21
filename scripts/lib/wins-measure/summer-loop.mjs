// Bridge Summer improvement-loop verify receipts into the company wins ledger.
// Reuses the same receipt shape + store overwrite path as measure-due/receipt.
// Local Summer memory (runs.jsonl) stays the agent diary; this hop makes
// measured verifies fleet capital.

/**
 * @typedef {{
 *   run_at?: string,
 *   previous_fix_effect?: string,
 *   pr_url?: string | null,
 *   pr_number?: number | null,
 *   repo?: string | null,
 *   metric?: string | null,
 *   after?: number | null,
 *   verify_with?: string | null,
 *   decision?: string,
 * }} SummerRun
 */

/** Effects that carry a post-deploy measurement (not "still waiting"). */
export const MEASURABLE_EFFECTS = new Set(['fixed', 'no-effect', 'regressed']);

/**
 * @param {string} text
 * @returns {SummerRun[]}
 */
export function parseSummerRuns(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // Skip corrupt lines; a partial diary must not block promotion.
    }
  }
  return out;
}

/**
 * Parse `https://github.com/owner/repo/pull/123` (or `/pulls/123`).
 * @param {string | null | undefined} url
 * @returns {{ repo: string, number: number } | null}
 */
export function parsePrUrl(url) {
  if (!url) return null;
  const m = String(url).match(/github\.com\/([^/]+\/[^/]+)\/pulls?\/(\d+)/i);
  if (!m) return null;
  return { repo: m[1], number: Number(m[2]) };
}

/**
 * @param {SummerRun} run
 * @returns {{ repo: string, number: number } | null}
 */
export function runPrRef(run) {
  if (run?.pr_number != null && Number.isFinite(Number(run.pr_number))) {
    const repo = run.repo ? String(run.repo) : 'JovieInc/Jovie';
    return { repo, number: Number(run.pr_number) };
  }
  return parsePrUrl(run?.pr_url);
}

/**
 * @param {object[]} wins
 * @param {{ repo: string, number: number }} ref
 */
export function findWinByPr(wins, ref) {
  return (
    wins.find(w =>
      (w.prs ?? []).some(
        p => p.number === ref.number && (!ref.repo || p.repo === ref.repo)
      )
    ) ?? null
  );
}

/**
 * Evidence URL/path for a Summer verify hop (machine-readable, not prose).
 * @param {SummerRun} run
 */
export function summerEvidence(run) {
  const at = run.run_at ?? 'unknown';
  const effect = run.previous_fix_effect ?? 'unknown';
  const probe = run.verify_with
    ? `#${encodeURIComponent(run.verify_with)}`
    : '';
  return `summer-improvement-loop/runs.jsonl#${at}#${effect}${probe}`;
}

/**
 * @param {object} win
 * @param {string} evidence
 * @param {string} metric
 */
function alreadyHasReceipt(win, evidence, metric) {
  return (win.receipts ?? []).some(
    r => r.metric === metric && r.evidence === evidence
  );
}

/**
 * Turn Summer verify runs into ledger receipt actions. Mutates wins when
 * receipts are appended (same contract as measureDueWins).
 *
 * @param {object[]} wins
 * @param {SummerRun[]} runs
 * @param {{
 *   dryRun?: boolean,
 *   at?: string,
 *   sha?: string | null,
 * }} [opts]
 */
export function applySummerVerifyReceipts(wins, runs, opts = {}) {
  /** @type {Array<{ id: string, metric: string, value: number, evidence: string, effect: string, pr: string }>} */
  const measured = [];
  /** @type {Array<{ reason: string, run_at?: string, pr_url?: string | null }>} */
  const skipped = [];
  /** @type {Array<{ reason: string, run_at?: string }>} */
  const errors = [];

  for (const run of runs) {
    const effect = run.previous_fix_effect;
    if (!MEASURABLE_EFFECTS.has(effect ?? '')) {
      skipped.push({
        reason: `effect ${effect ?? 'missing'} is not measurable`,
        run_at: run.run_at,
        pr_url: run.pr_url,
      });
      continue;
    }
    if (typeof run.after !== 'number' || !Number.isFinite(run.after)) {
      skipped.push({
        reason: 'no numeric after from Summer verify probe',
        run_at: run.run_at,
        pr_url: run.pr_url,
      });
      continue;
    }
    const ref = runPrRef(run);
    if (!ref) {
      skipped.push({
        reason: 'no pr_url/pr_number to match a win',
        run_at: run.run_at,
        pr_url: run.pr_url,
      });
      continue;
    }
    const win = findWinByPr(wins, ref);
    if (!win) {
      skipped.push({
        reason: `no wins-ledger record for ${ref.repo}#${ref.number}`,
        run_at: run.run_at,
        pr_url: run.pr_url,
      });
      continue;
    }
    const metrics = (win.metrics ?? []).filter(m => m.before !== null);
    if (!metrics.length) {
      // Mismatch against ledger shape — skip, do not hard-fail. Append-only
      // runs.jsonl would otherwise exit 1 on every later promote forever.
      skipped.push({
        reason: `${win.id}: no measurable metrics (all before null)`,
        run_at: run.run_at,
        pr_url: run.pr_url,
      });
      continue;
    }
    const metricName =
      (run.metric && metrics.find(m => m.name === run.metric)?.name) ||
      (metrics.length === 1 ? metrics[0].name : null);
    if (!metricName) {
      skipped.push({
        reason: `${win.id}: run.metric required when win has multiple metrics`,
        run_at: run.run_at,
        pr_url: run.pr_url,
      });
      continue;
    }
    const evidence = summerEvidence(run);
    if (alreadyHasReceipt(win, evidence, metricName)) {
      skipped.push({
        reason: `${win.id}: receipt already present for this Summer verify`,
        run_at: run.run_at,
        pr_url: run.pr_url,
      });
      continue;
    }
    const at = opts.at ?? run.run_at ?? new Date().toISOString();
    measured.push({
      id: win.id,
      metric: metricName,
      value: run.after,
      evidence,
      effect,
      pr: `${ref.repo}#${ref.number}`,
    });
    if (!opts.dryRun) {
      win.receipts = win.receipts ?? [];
      win.receipts.push({
        metric: metricName,
        value: run.after,
        at,
        evidence,
        sha: opts.sha ?? null,
      });
    }
  }

  return {
    at: opts.at ?? new Date().toISOString(),
    measured,
    skipped,
    errors,
    dryRun: Boolean(opts.dryRun),
    adapter: 'summer-loop',
  };
}
