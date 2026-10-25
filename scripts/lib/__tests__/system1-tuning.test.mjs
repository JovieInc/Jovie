import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildDataset,
  buildReport,
  guardrailFailures,
  latestLabels,
  score,
  splitOf,
} from '../system1/eval.mjs';
import { activeVersion, system1Call } from '../system1/router.mjs';
import { createStore } from '../system1/store.mjs';
import { rollback, tuneTask } from '../system1/tune.mjs';

const registry = () => ({
  routes: {
    a: {
      kind: 'fake',
      pathId: 'a@api',
      model: 'a',
      accessPath: 'api',
      funding: 'cash',
      usdPerMInput: 1,
      images: false,
    },
    b: {
      kind: 'fake',
      pathId: 'b@credits',
      model: 'b',
      accessPath: 'credits',
      funding: 'given-credits',
      usdPerMInput: 0.1,
      images: true,
    },
  },
  tasks: {
    t: {
      retainInput: true,
      dailyCapUsd: 0.5,
      primary: 'q',
      labels: ['yes', 'no'],
      positive: 'yes',
      objective: 'f1',
      guardrails: { minPrecision: 0.8 },
      minHeldout: 5,
      baseline: {
        routes: ['a', 'b'],
        preamble: 'P',
        questions: {
          q: {
            type: 'choice',
            instructions: 'i',
            criteria: { yes: 'y', no: 'n' },
          },
        },
        thresholds: { default: 0 },
        fewshot: [],
      },
    },
  },
});

let dir, store, now;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 's1-'));
  store = createStore(dir);
  now = (() => {
    let t = Date.parse('2026-10-25T00:00:00Z');
    return () => (t += 1000);
  })();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const answer = (choice, p) => ({
  answers: { q: { type: 'choice', choice, probabilities: { [choice]: p } } },
  inputTokens: 1000,
  outputTokens: 0,
});

describe('eval', () => {
  it('joins the newest label by key, ignores replays, and scores with abstain as a miss', async () => {
    const reg = registry();
    const fake = async ({ state }) =>
      answer(state.includes('POS') ? 'yes' : 'yes', 0.9);
    const d = { registry: reg, store, now, transports: { fake } };
    await system1Call({ task: 't', state: 'POS 1', key: 'k1' }, d);
    await system1Call({ task: 't', state: 'NEG 2', key: 'k2' }, d);
    await system1Call(
      { task: 't', state: 'NEG 2', key: 'k2', replay: true },
      d
    );
    const lab = (key, label, ts) =>
      store.appendLabel({ task: 't', key, label, ts, source: 's' });
    lab('k1', 'no', '2026-10-25T01:00:00.000Z');
    lab('k1', 'yes', '2026-10-25T02:00:00.000Z');
    lab('k2', 'no', '2026-10-25T01:00:00.000Z');
    expect(latestLabels(store.labels('t'), 't').get('key:k1').label).toBe(
      'yes'
    );
    const items = buildDataset(store, 't', reg.tasks.t);
    expect(items).toHaveLength(2);
    const m = score(items, reg.tasks.t, i => ({
      decision: i.byVersion.v1.decision,
    }));
    expect(m).toMatchObject({ n: 2, precision: 0.5, recall: 1, fpr: 1 });
    expect(
      guardrailFailures(m, { minPrecision: 0.8, maxFalsePositiveRate: 0.5 })
    ).toEqual(['minPrecision', 'maxFalsePositiveRate']);
    expect(splitOf('key:k1')).toBe(splitOf('key:k1'));
  });
  it('reports volume, cost, latency, label coverage and weekly trend per task', async () => {
    const reg = registry();
    const d = {
      registry: reg,
      store,
      now,
      transports: { fake: async () => answer('yes', 0.9) },
    };
    for (let i = 0; i < 4; i++) {
      await system1Call({ task: 't', state: `s${i}`, key: `k${i}` }, d);
      store.appendLabel({
        task: 't',
        key: `k${i}`,
        label: i % 2 ? 'yes' : 'no',
        ts: '2026-10-25T01:00:00.000Z',
      });
    }
    const rep = buildReport(
      reg,
      store,
      id => activeVersion(reg, id, store),
      () => Date.parse('2026-10-26T00:00:00Z')
    );
    expect(rep.tasks.t).toMatchObject({
      calls7d: 4,
      labeled: 4,
      activeVersion: 'v1',
      quality: { n: 4, precision: 0.5 },
    });
    expect(rep.tasks.t.trend[0]).toMatchObject({ week: '2026-10-19', n: 4 });
    expect(rep.tasks.t.costUsd7d).toBeGreaterThan(0);
  });
});

/** 60 labeled items; v1 calls ready at 0.9 when right and 0.6 when it is a false positive. */
async function seedLabeled(reg, n = 80) {
  const d = {
    registry: reg,
    store,
    now,
    transports: {
      fake: async ({ state }) => {
        const wrong = state.includes('WRONG');
        return answer('yes', wrong ? 0.6 : 0.9);
      },
    },
  };
  for (let i = 0; i < n; i++) {
    const truthYes = i % 2 === 0;
    const fp = !truthYes && i % 4 === 1; // every other negative is a confident-ish false positive
    const state = fp ? `item ${i} WRONG` : `item ${i}`;
    if (!truthYes && !fp) {
      // true negatives the model also calls "no"
      d.transports.fake = d.transports.fake;
    }
    await system1Call(
      { task: 't', state: truthYes ? `item ${i}` : state, key: `k${i}` },
      {
        ...d,
        transports: {
          fake: async () =>
            truthYes
              ? answer('yes', 0.9)
              : fp
                ? answer('yes', 0.6)
                : answer('no', 0.9),
        },
      }
    );
    store.appendLabel({
      task: 't',
      key: `k${i}`,
      label: truthYes ? 'yes' : 'no',
      ts: '2026-10-25T01:00:00.000Z',
      source: 'outcome',
    });
  }
}

describe('tuning', () => {
  it('refuses to tune without enough held-out data', async () => {
    const reg = registry();
    await seedLabeled(reg, 6);
    const r = await tuneTask({
      registry: reg,
      store,
      task: 't',
      now,
      run: async () => ({ status: 'error' }),
    });
    expect(r.status).toBe('insufficient-data');
  });
  it('promotes a recalibrated threshold that wins on held-out without breaking guardrails, then rolls back', async () => {
    const reg = registry();
    await seedLabeled(reg);
    const r = await tuneTask({
      registry: reg,
      store,
      task: 't',
      apply: true,
      replay: false,
      now,
    });
    expect(r.status).toBe('promoted');
    expect(r.promoted).toBe('v2');
    const win = r.candidates.find(c => c.kind === 'threshold');
    expect(win).toMatchObject({ promote: true, offline: true });
    expect(win.candidate.precision).toBeGreaterThan(win.current.precision);
    expect(win.guardrailFailures).toEqual([]);
    expect(activeVersion(reg, 't', store)).toMatchObject({ id: 'v2' });
    expect(activeVersion(reg, 't', store).thresholds.default).toBeGreaterThan(
      0.6
    );
    expect(rollback(store, 't', now)).toMatchObject({
      status: 'rolled-back',
      from: 'v2',
      to: 'v1',
    });
    expect(activeVersion(reg, 't', store).id).toBe('v1');
  });
  it('does not promote a candidate that fails a guardrail or does not net-win', async () => {
    const reg = registry();
    await seedLabeled(reg);
    // A replay model that is strictly worse: always says yes.
    const run = async () => ({
      status: 'ok',
      choice: 'yes',
      probabilities: { yes: 0.99 },
      decision: 'yes',
      costUsd: 0.001,
    });
    const r = await tuneTask({
      registry: reg,
      store,
      task: 't',
      apply: true,
      now,
      run,
      opts: { minGain: 0.5 },
    });
    const replayed = r.candidates.filter(c => !c.offline);
    expect(replayed.length).toBeGreaterThan(0);
    for (const c of replayed) expect(c.promote).toBe(false);
  });
  it('promotes a few-shot candidate when replay shows verified mistakes fixed', async () => {
    const reg = registry();
    await seedLabeled(reg);
    reg.tasks.t.guardrails = {};
    const run = async req => {
      expect(req.routes).toHaveLength(1); // replays score one model, never a fallthrough
      const truth = store
        .labels('t')
        .find(l => `replay:key:${l.key}` === req.key).label;
      const learned = (req.versionObject.fewshot ?? []).length > 0;
      const choice = learned ? truth : 'yes';
      return {
        status: 'ok',
        choice,
        probabilities: { [choice]: 0.95 },
        decision: choice,
        costUsd: 0.0001,
      };
    };
    const r = await tuneTask({
      registry: reg,
      store,
      task: 't',
      apply: true,
      now,
      run,
      tryRoutes: false,
      opts: { minNetWins: 1 },
    });
    const few = r.candidates.find(c => c.kind === 'fewshot');
    expect(few.wins).toBeGreaterThan(few.losses);
    expect(few.promote).toBe(true);
    expect(r.promoted).toBe('v2');
    expect(few.candidate.objective).toBeGreaterThan(few.current.objective);
  });
});

describe('outcome labelers', () => {
  it('maps mirror outcomes to labels and joins them onto called keys only', async () => {
    const { backlogReadinessOutcome, labelOutcomes } = await import(
      '../system1/labelers.mjs'
    );
    expect(
      backlogReadinessOutcome({ state: 'Validating', labels: ['agent-ready'] })
    ).toMatchObject({ label: 'ready' });
    expect(
      backlogReadinessOutcome({
        state: 'Validating',
        labels: ['codex-blocked'],
      })
    ).toMatchObject({ label: 'not_ready' });
    expect(
      backlogReadinessOutcome({ state: 'Rework', labels: [] })
    ).toMatchObject({ label: 'not_ready' });
    expect(
      backlogReadinessOutcome({ state: 'Backlog', labels: [] })
    ).toBeNull();
    const reg = registry();
    reg.tasks['backlog-readiness'] = reg.tasks.t;
    const d = {
      registry: reg,
      store,
      now,
      transports: { fake: async () => answer('yes', 0.9) },
    };
    for (const key of ['JOV-1', 'JOV-2', 'JOV-3', 'JOV-4'])
      await system1Call({ task: 'backlog-readiness', state: key, key }, d);
    const issues = [
      { identifier: 'JOV-1', state: 'Merging', labels: [] },
      { identifier: 'JOV-2', state: 'Rework', labels: [] },
      { identifier: 'JOV-3', state: 'Backlog', labels: [] },
      { identifier: 'JOV-9', state: 'Merging', labels: [] },
    ];
    const first = labelOutcomes({
      store,
      task: 'backlog-readiness',
      issues,
      now,
    });
    expect(first).toMatchObject({
      keys: 4,
      matched: 2,
      appended: 2,
      undecided: 1,
      missing: 1,
    });
    expect(
      labelOutcomes({ store, task: 'backlog-readiness', issues, now })
    ).toMatchObject({ appended: 0, unchanged: 2 });
    issues[0].state = 'Rework'; // outcome changes later: the correction is appended, newest wins
    expect(
      labelOutcomes({ store, task: 'backlog-readiness', issues, now }).appended
    ).toBe(1);
    expect(
      latestLabels(store.labels('backlog-readiness'), 'backlog-readiness').get(
        'key:JOV-1'
      ).label
    ).toBe('not_ready');
  });
});
