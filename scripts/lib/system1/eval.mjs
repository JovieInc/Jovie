/**
 * Join outcomes back to calls, build per-task eval sets, and score them.
 *
 * Ground truth is a label row {task, key | inputHash, label, source}. A call
 * carries the same key (an issue id, a screenshot path, a Sentry group). The
 * newest label for a (task, key) wins, so a later correction replaces an
 * earlier outcome. Replay calls made by the tuning loop never count as
 * production volume or as predictions of record.
 */
import { sha256 } from './store.mjs';

const usable = c => !c.replay && (c.status === 'ok' || c.status === 'invalid');

/** Newest label per item id; an item id is `key:<key>` or `hash:<inputHash>`. */
export function latestLabels(labels, task) {
  const byId = new Map();
  for (const row of labels) {
    if (row.task !== task) continue;
    const id = row.key ? `key:${row.key}` : `hash:${row.inputHash}`;
    const prev = byId.get(id);
    if (!prev || row.ts >= prev.ts) byId.set(id, row);
  }
  return byId;
}

/** Deterministic split that stays stable as data grows: ~30% held out. */
export function splitOf(id) {
  return parseInt(sha256(id).slice(0, 8), 16) % 100 < 30 ? 'heldout' : 'train';
}

/** One item per labeled key with its production calls grouped by version. */
export function buildDataset(store, task, taskDef) {
  const labels = latestLabels(store.labels(task), task);
  const calls = store.calls({ task }).filter(usable);
  const items = [];
  for (const [id, label] of labels) {
    if (!taskDef.labels.includes(label.label)) continue;
    const mine = calls.filter(c =>
      id.startsWith('key:')
        ? c.key === label.key
        : c.inputHash === label.inputHash
    );
    if (!mine.length) continue;
    const newest = mine.reduce((a, b) => (a.ts >= b.ts ? a : b));
    const byVersion = {};
    for (const c of mine) {
      if (!byVersion[c.version] || c.ts > byVersion[c.version].ts)
        byVersion[c.version] = c;
    }
    items.push({
      id,
      key: label.key ?? null,
      label: label.label,
      labelSource: label.source ?? null,
      labelAt: label.ts,
      inputHash: newest.inputHash,
      byVersion,
      split: splitOf(id),
    });
  }
  return items.sort((a, b) => (a.id < b.id ? -1 : 1));
}

const ratio = (a, b) => (b === 0 ? null : a / b);

/**
 * @param {Array<{label: string}>} items
 * @param {(item: object) => {decision: string|null} | null} predict
 */
export function score(items, taskDef, predict) {
  const pos = taskDef.positive;
  let n = 0,
    decided = 0,
    correct = 0,
    tp = 0,
    fp = 0,
    fn = 0,
    negatives = 0;
  const confusion = {};
  for (const item of items) {
    const pred = predict(item);
    if (!pred) continue;
    n += 1;
    const d = pred.decision;
    const key = `${item.label}->${d ?? 'abstain'}`;
    confusion[key] = (confusion[key] ?? 0) + 1;
    if (d !== null) {
      decided += 1;
      if (d === item.label) correct += 1;
    }
    if (item.label === pos) {
      if (d === pos) tp += 1;
      else fn += 1;
    } else {
      negatives += 1;
      if (d === pos) fp += 1;
    }
  }
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? precision === null && recall === null
        ? null
        : 0
      : (2 * precision * recall) / (precision + recall);
  const metrics = {
    n,
    coverage: ratio(decided, n),
    abstain: ratio(n - decided, n),
    accuracy: ratio(correct, n),
    accuracyDecided: ratio(correct, decided),
    precision,
    recall,
    fpr: ratio(fp, negatives),
    f1,
    confusion,
  };
  metrics.objective = metrics[taskDef.objective] ?? null;
  return metrics;
}

/** Guardrails are absolute floors/ceilings on the candidate. Returns the failed names. */
export function guardrailFailures(metrics, guardrails = {}) {
  const failed = [];
  if (!metrics.n) return failed; // no labeled outcomes yet: nothing to judge
  const lt = (value, min) => value === null || value < min;
  const gt = (value, max) => value !== null && value > max;
  if (
    guardrails.minPrecision !== undefined &&
    lt(metrics.precision, guardrails.minPrecision)
  )
    failed.push('minPrecision');
  if (
    guardrails.minRecall !== undefined &&
    lt(metrics.recall, guardrails.minRecall)
  )
    failed.push('minRecall');
  if (
    guardrails.minCoverage !== undefined &&
    lt(metrics.coverage, guardrails.minCoverage)
  )
    failed.push('minCoverage');
  if (
    guardrails.maxFalsePositiveRate !== undefined &&
    gt(metrics.fpr, guardrails.maxFalsePositiveRate)
  )
    failed.push('maxFalsePositiveRate');
  if (
    guardrails.maxAbstain !== undefined &&
    gt(metrics.abstain, guardrails.maxAbstain)
  )
    failed.push('maxAbstain');
  return failed;
}

/** Predictor that reads the production call of one version (no model calls). */
export const loggedPredictor = (version, decideWith) => item => {
  const call = item.byVersion[version];
  if (!call || call.status !== 'ok') return null;
  return decideWith ? decideWith(call) : { decision: call.decision };
};

const isoWeek = ts => {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};

/** Weekly quality of the predictions of record, bucketed by the week the label arrived. */
export function weeklyTrend(items, taskDef, weeks = 8) {
  const buckets = new Map();
  for (const item of items) {
    const wk = isoWeek(item.labelAt);
    if (!buckets.has(wk)) buckets.set(wk, []);
    buckets.get(wk).push(item);
  }
  return [...buckets.keys()]
    .sort()
    .slice(-weeks)
    .map(week => {
      const m = score(buckets.get(week), taskDef, item => {
        const call = Object.values(item.byVersion).sort((a, b) =>
          a.ts < b.ts ? 1 : -1
        )[0];
        return call?.status === 'ok' ? { decision: call.decision } : null;
      });
      return {
        week,
        n: m.n,
        accuracy: m.accuracy,
        precision: m.precision,
        recall: m.recall,
        f1: m.f1,
        coverage: m.coverage,
      };
    });
}

const quantile = (sorted, q) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
    : null;

/** Per-task operating report: volume, cost, latency, label coverage and quality. */
export function buildReport(registry, store, activeOf, now = Date.now) {
  const t = now();
  const day = 86_400_000;
  const since30 = new Date(t - 30 * day).toISOString();
  const since7 = new Date(t - 7 * day).toISOString();
  const tasks = {};
  for (const [id, def] of Object.entries(registry.tasks)) {
    const all = store
      .calls({ task: id, since: since30 })
      .filter(c => !c.replay);
    const w7 = all.filter(c => c.ts >= since7);
    const ok = all.filter(c => c.status === 'ok');
    const lat = ok.map(c => c.latencyMs).sort((a, b) => a - b);
    const cost = rows => rows.reduce((s, c) => s + (c.costUsd ?? 0), 0);
    const items = buildDataset(store, id, def);
    const active = activeOf(id);
    const heldout = items.filter(i => i.split === 'heldout');
    const quality = score(items, def, loggedPredictor(active.id));
    const q7 = score(
      items.filter(i => i.labelAt >= since7),
      def,
      loggedPredictor(active.id)
    );
    const replayCost = store
      .calls({ task: id, since: since30 })
      .filter(c => c.replay)
      .reduce((s, c) => s + (c.costUsd ?? 0), 0);
    tasks[id] = {
      description: def.description,
      owner: def.owner,
      activeVersion: active.id,
      routes: active.routes,
      calls7d: w7.length,
      calls30d: all.length,
      errorRate30d: all.length
        ? all.filter(c => c.status === 'error').length / all.length
        : null,
      abstainRate30d: ok.length
        ? ok.filter(c => c.abstained).length / ok.length
        : null,
      latencyMsP50: quantile(lat, 0.5),
      latencyMsP95: quantile(lat, 0.95),
      costUsd7d: cost(w7),
      costUsd30d: cost(all),
      tuningCostUsd30d: replayCost,
      costPerCallUsd: ok.length ? cost(ok) / ok.length : null,
      labeled: items.length,
      labelCoverage: ok.length ? Math.min(1, items.length / ok.length) : null,
      heldout: heldout.length,
      quality: pick(quality),
      quality7d: pick(q7),
      qualityByVersion: Object.fromEntries(
        [...new Set(items.flatMap(i => Object.keys(i.byVersion)))]
          .sort()
          .map(v => [v, pick(score(items, def, loggedPredictor(v)))])
          .filter(([, m]) => m.n > 0)
      ),
      guardrailFailures: guardrailFailures(quality, def.guardrails),
      trend: weeklyTrend(items, def),
    };
  }
  return {
    schema: 'jovie.system1-report/v1',
    generatedAt: new Date(t).toISOString(),
    tasks,
  };
}

const pick = m => ({
  n: m.n,
  coverage: m.coverage,
  accuracy: m.accuracy,
  precision: m.precision,
  recall: m.recall,
  fpr: m.fpr,
  f1: m.f1,
});
