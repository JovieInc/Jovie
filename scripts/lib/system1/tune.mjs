/**
 * Periodic tuning: propose candidate versions from joined outcomes, score them
 * and the current version on the same held-out set, promote only on a real win.
 *
 * Levers, cheapest first:
 *   threshold   per-task abstain floor recalibrated from logged probabilities
 *               (offline, zero model calls)
 *   cutoff      binary tasks: positive-class probability cutoff (offline)
 *   fewshot     verified mistakes from the train split become worked examples
 *   route       the same prompt on another decision model (Jev vs Clef)
 * Fine-tuning is not a lever here: Clef fine-tunes are a Cloudflare managed
 * service (design-partner form, unpriced) and Jev has no public tuning path.
 * Both are recorded as asks in docs/evaluations/system1.md.
 *
 * Promotion needs all of: enough held-out items, guardrails hold on the
 * candidate, objective gain >= minGain, and net wins (items the candidate gets
 * right that the current gets wrong, minus the reverse) >= minNetWins. The
 * previous version stays in history, so `rollback` is one pointer move.
 */
import { buildDataset, guardrailFailures, score } from './eval.mjs';
import { activeVersion, decide, system1Call, taskOf } from './router.mjs';

export const DEFAULTS = Object.freeze({
  minGain: 0.02,
  minNetWins: 2,
  fewshotMax: 8,
  fewshotPerRun: 4,
  exampleChars: 700,
  maxReplay: 200,
});

const THRESHOLD_GRID = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

/** Re-decide a logged call under a different version's thresholds. */
const redecide = (task, version) => call => {
  if (call.status !== 'ok' || !call.choice) return null;
  const answers = {
    [task.primary]: {
      type: 'choice',
      choice: call.choice,
      probabilities: call.probabilities,
    },
  };
  return decide(version, task, answers);
};

/** Production predictions of the current version, falling back to nothing. */
function currentPredictor(task, current, callOf) {
  const re = redecide(task, current);
  return item => {
    const call = callOf(item);
    return call ? re(call) : null;
  };
}

function calibrateThreshold(task, current, train, callOf) {
  let best = null;
  for (const t of THRESHOLD_GRID) {
    const version = { ...current, thresholds: { default: t } };
    const re = redecide(task, version);
    const m = score(train, task, item => {
      const call = callOf(item);
      return call ? re(call) : null;
    });
    if (!m.n || m.objective === null) continue;
    if (guardrailFailures(m, task.guardrails).length) continue;
    if (!best || m.objective > best.objective + 1e-9)
      best = { t, objective: m.objective };
  }
  return best;
}

const CUTOFF_GRID = [
  0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75,
  0.8, 0.85, 0.9,
];

/** Binary tasks: the positive-class probability cutoff that maximises the objective on train. */
function calibrateCutoff(task, current, train, callOf) {
  if (task.labels.length !== 2) return null;
  let best = null;
  for (const t of CUTOFF_GRID) {
    const version = { ...current, positiveCutoff: t, thresholds: {} };
    const re = redecide(task, version);
    const m = score(train, task, item => {
      const call = callOf(item);
      return call ? re(call) : null;
    });
    if (!m.n || m.objective === null) continue;
    if (guardrailFailures(m, task.guardrails).length) continue;
    if (!best || m.objective > best.objective + 1e-9)
      best = { t, objective: m.objective };
  }
  return best;
}

function pickExamples(task, current, train, store, limit, chars, callOf) {
  const have = new Set((current.fewshot ?? []).map(e => e.inputHash));
  const re = currentPredictor(task, current, callOf);
  const wrong = train.filter(item => {
    const p = re(item);
    return p && p.decision !== item.label && !have.has(item.inputHash);
  });
  const byLabel = {};
  for (const item of wrong) (byLabel[item.label] ??= []).push(item);
  const out = [];
  for (let i = 0; out.length < limit; i++) {
    let added = false;
    for (const label of Object.keys(byLabel)) {
      const item = byLabel[label][i];
      if (!item || out.length >= limit) continue;
      const input = store.input(item.inputHash);
      if (!input?.state || input.images?.length) continue; // text examples only
      out.push({
        inputHash: item.inputHash,
        state: input.state.slice(0, chars),
        label: item.label,
      });
      added = true;
    }
    if (!added) break;
  }
  return out;
}

async function replayCalls(task, version, items, store, run) {
  const out = new Map();
  for (const item of items) {
    const input = store.input(item.inputHash);
    if (!input) continue;
    const call = await run({
      task: task.id,
      state: input.state,
      images: (input.images ?? []).map(d =>
        Buffer.from(d.split(',')[1], 'base64')
      ),
      key: `replay:${item.id}`,
      caller: 'tune-replay',
      replay: true,
      versionObject: version,
      // Score the primary route alone: a fallthrough to another model would
      // blur which model produced the answer being compared.
      routes: [version.routes[0]],
    });
    out.set(item.id, call.status === 'ok' ? call : null);
  }
  return out;
}

function compare(task, heldout, cur, cand, opts) {
  const common = heldout.filter(i => cur(i) && cand(i));
  const mc = score(common, task, cur);
  const mn = score(common, task, cand);
  // Per-item utility: right +1, abstain 0 (the heavier path handles it), wrong -1.
  const utility = (pred, item) =>
    pred.decision === null ? 0 : pred.decision === item.label ? 1 : -1;
  let wins = 0,
    losses = 0;
  for (const i of common) {
    const a = utility(cur(i), i);
    const b = utility(cand(i), i);
    if (b > a) wins += 1;
    if (b < a) losses += 1;
  }
  const gain = (mn.objective ?? 0) - (mc.objective ?? 0);
  const failed = guardrailFailures(mn, task.guardrails);
  const regressed = ['precision', 'recall'].filter(
    k => (mn[k] ?? 0) < (mc[k] ?? 0) - 0.05 && failed.length
  );
  const promote =
    common.length >= task.minHeldout &&
    failed.length === 0 &&
    gain >= opts.minGain &&
    wins - losses >= opts.minNetWins;
  return {
    n: common.length,
    current: mc,
    candidate: mn,
    gain,
    wins,
    losses,
    guardrailFailures: failed,
    regressed,
    promote,
  };
}

/**
 * @param {{registry: object, store: object, task: string, apply?: boolean, replay?: boolean, tryRoutes?: boolean, run?: Function, now?: () => number, opts?: object}} p
 */
export async function tuneTask(p) {
  const { registry, store } = p;
  const now = p.now ?? Date.now;
  const opts = { ...DEFAULTS, ...(p.opts ?? {}) };
  const def = { ...taskOf(registry, p.task), id: p.task };
  const run =
    p.run ?? (req => system1Call(req, { registry, store, ...(p.deps ?? {}) }));
  const current = activeVersion(registry, p.task, store);
  const items = buildDataset(store, p.task, def);
  const train = items.filter(i => i.split === 'train');
  const heldout = items.filter(i => i.split === 'heldout');
  const report = {
    schema: 'jovie.system1-tune/v1',
    task: p.task,
    at: new Date(now()).toISOString(),
    current: current.id,
    items: items.length,
    train: train.length,
    heldout: heldout.length,
    candidates: [],
    promoted: null,
  };
  if (heldout.length < def.minHeldout) {
    return { ...report, status: 'insufficient-data', need: def.minHeldout };
  }
  // Predictions of the current version: logged production calls, plus a replay
  // for labeled items it never saw (for example right after a promotion).
  const logged = item => item.byVersion[current.id] ?? null;
  const missing = items.filter(i => !logged(i)).slice(0, opts.maxReplay);
  const filled =
    p.replay === false
      ? new Map()
      : await replayCalls(def, current, missing, store, run);
  const callOf = item => logged(item) ?? filled.get(item.id) ?? null;
  const cur = currentPredictor(def, current, callOf);
  if (!heldout.some(cur))
    return { ...report, status: 'no-current-predictions' };

  const candidates = [];
  const cal = calibrateThreshold(def, current, train, callOf);
  if (cal && cal.t !== (current.thresholds?.default ?? 0)) {
    const spec = {
      ...current,
      thresholds: { ...current.thresholds, default: cal.t },
    };
    const re = redecide(def, spec);
    candidates.push({
      kind: 'threshold',
      detail: `default floor ${cal.t}`,
      spec,
      predict: item => {
        const c = callOf(item);
        return c ? re(c) : null;
      },
      offline: true,
    });
  }
  const cut = calibrateCutoff(def, current, train, callOf);
  if (cut && cut.t !== current.positiveCutoff) {
    const spec = { ...current, positiveCutoff: cut.t, thresholds: {} };
    const re = redecide(def, spec);
    candidates.push({
      kind: 'cutoff',
      detail: `P(${def.positive}) >= ${cut.t}`,
      spec,
      predict: item => {
        const c = callOf(item);
        return c ? re(c) : null;
      },
      offline: true,
    });
  }
  if (p.replay !== false) {
    const examples = pickExamples(
      def,
      current,
      train,
      store,
      opts.fewshotPerRun,
      opts.exampleChars,
      callOf
    );
    if (examples.length) {
      const fewshot = [...(current.fewshot ?? []), ...examples].slice(
        -opts.fewshotMax
      );
      const spec = { ...current, fewshot };
      candidates.push({
        kind: 'fewshot',
        detail: `+${examples.length} verified mistakes`,
        spec,
      });
    }
    if (p.tryRoutes !== false) {
      const hasImages = heldout.some(
        i => store.input(i.inputHash)?.images?.length
      );
      for (const [id, route] of Object.entries(registry.routes)) {
        if (current.routes[0] === id || (hasImages && !route.images)) continue;
        candidates.push({
          kind: 'route',
          detail: `${id} first`,
          spec: {
            ...current,
            routes: [id, ...current.routes.filter(r => r !== id)],
          },
        });
      }
    }
  }
  let best = null;
  const consider = (c, cmp) => {
    report.candidates.push({
      kind: c.kind,
      detail: c.detail,
      offline: Boolean(c.offline),
      ...cmp,
    });
    if (
      cmp.promote &&
      (!best || cmp.candidate.objective > best.cmp.candidate.objective)
    )
      best = { c, cmp };
  };
  for (const c of candidates) {
    let heldoutCalls = null;
    if (!c.predict) {
      heldoutCalls = await replayCalls(def, c.spec, heldout, store, run);
      const re = redecide(def, c.spec);
      c.predict = item => {
        const call = heldoutCalls.get(item.id);
        return call ? re(call) : null;
      };
    }
    consider(c, compare(def, heldout, cur, c.predict, opts));
    // A replayed prompt/route is a new operating point: recalibrate its cutoff on
    // replayed train items (never on held-out) and score that variant as well.
    if (
      heldoutCalls &&
      def.labels.length === 2 &&
      p.calibrateReplays !== false
    ) {
      const sample = train.slice(0, opts.maxReplay);
      const trainCalls = await replayCalls(def, c.spec, sample, store, run);
      const callOf2 = item =>
        heldoutCalls.get(item.id) ?? trainCalls.get(item.id) ?? null;
      const cut2 = calibrateCutoff(def, c.spec, sample, callOf2);
      if (cut2) {
        const spec = { ...c.spec, positiveCutoff: cut2.t, thresholds: {} };
        const re = redecide(def, spec);
        const variant = {
          kind: `${c.kind}+cutoff`,
          detail: `${c.detail}; P(${def.positive}) >= ${cut2.t}`,
          spec,
          offline: false,
          predict: item => {
            const call = heldoutCalls.get(item.id);
            return call ? re(call) : null;
          },
        };
        consider(variant, compare(def, heldout, cur, variant.predict, opts));
      }
    }
  }
  report.status = best ? 'promotable' : 'no-better-candidate';
  if (best && p.apply) {
    const saved = store.versions(p.task) ?? {
      active: null,
      previous: null,
      history: [],
      events: [],
    };
    const id = `v${saved.history.length + 2}`;
    saved.history.push({
      id,
      parent: current.id,
      createdAt: report.at,
      kind: best.c.kind,
      detail: best.c.detail,
      spec: best.c.spec,
      evaluation: best.cmp,
    });
    saved.previous = saved.active;
    saved.active = id;
    (saved.events ??= []).push({
      at: report.at,
      event: 'promote',
      from: current.id,
      to: id,
    });
    store.saveVersions(p.task, saved);
    report.promoted = id;
    report.status = 'promoted';
  }
  return report;
}

/** One pointer move back to the previous version (null previous = baseline v1). */
export function rollback(store, task, now = Date.now) {
  const saved = store.versions(task);
  if (!saved?.active) return { status: 'nothing-to-roll-back', task };
  const from = saved.active;
  saved.active = saved.previous;
  saved.previous = null;
  (saved.events ??= []).push({
    at: new Date(now()).toISOString(),
    event: 'rollback',
    from,
    to: saved.active ?? 'v1',
  });
  store.saveVersions(task, saved);
  return { status: 'rolled-back', task, from, to: saved.active ?? 'v1' };
}
