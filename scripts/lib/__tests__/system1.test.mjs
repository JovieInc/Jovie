import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  activeVersion,
  buildState,
  decide,
  loadRegistry,
  system1Call,
} from '../system1/router.mjs';
import { createStore, stateDir } from '../system1/store.mjs';

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

describe('router', () => {
  it('logs input hash, output, latency, cost and version; retains input', async () => {
    const row = await system1Call(
      { task: 't', state: 'hello', key: 'K1' },
      {
        registry: registry(),
        store,
        now,
        transports: { fake: async () => answer('yes', 0.9) },
      }
    );
    expect(row).toMatchObject({
      status: 'ok',
      decision: 'yes',
      version: 'v1',
      key: 'K1',
      route: { id: 'a', accessPath: 'api' },
    });
    expect(row.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.costUsd).toBeCloseTo(0.001);
    expect(store.calls({ task: 't' })).toHaveLength(1);
    expect(store.input(row.inputHash).state).toBe('hello');
  });
  it('abstains under the per-class floor and rejects out-of-vocabulary answers', () => {
    const task = registry().tasks.t;
    const v = { thresholds: { default: 0.7, no: 0.9 } };
    expect(decide(v, task, answer('yes', 0.69).answers)).toMatchObject({
      decision: null,
      abstained: true,
    });
    expect(decide(v, task, answer('no', 0.85).answers).decision).toBeNull();
    expect(decide(v, task, answer('yes', 0.8).answers).decision).toBe('yes');
    expect(decide(v, task, answer('maybe', 0.99).answers)).toMatchObject({
      invalid: true,
      decision: null,
    });
  });
  it('falls through routes, skips image-incapable routes, and never throws on provider failure', async () => {
    const reg = registry();
    let order = [];
    const fake = async ({ route }) => {
      order.push(route.model);
      if (route.model === 'a') throw new Error('boom');
      return answer('no', 0.95);
    };
    const row = await system1Call(
      { task: 't', state: 's' },
      { registry: reg, store, now, transports: { fake } }
    );
    expect(order).toEqual(['a', 'b']);
    expect(row).toMatchObject({
      status: 'ok',
      route: { id: 'b' },
      fallbackFrom: ['a'],
    });
    order = [];
    const img = await system1Call(
      { task: 't', state: 's2', images: [Buffer.from('x')] },
      { registry: reg, store, now, transports: { fake } }
    );
    expect(order).toEqual(['b']);
    expect(img.status).toBe('ok');
    const dead = await system1Call(
      { task: 't', state: 's3' },
      {
        registry: reg,
        store,
        now,
        transports: {
          fake: async () => {
            throw new Error('down');
          },
        },
      }
    );
    expect(dead).toMatchObject({
      status: 'error',
      decision: null,
      abstained: true,
    });
    expect(dead.errors).toHaveLength(2);
  });
  it('stops at the task daily cap and logs it', async () => {
    const fake = async () => ({ ...answer('yes', 0.9), costUsd: 0.3 });
    const d = { registry: registry(), store, now, transports: { fake } };
    await system1Call({ task: 't', state: '1' }, d);
    await system1Call({ task: 't', state: '2' }, d);
    const third = await system1Call({ task: 't', state: '3' }, d);
    expect(third.status).toBe('over-budget');
  });
  it('counts tuning replays against their own cap so they never starve production', async () => {
    const fake = async () => ({ ...answer('yes', 0.9), costUsd: 0.3 });
    const d = { registry: registry(), store, now, transports: { fake } };
    await system1Call({ task: 't', state: 'r1', replay: true }, d);
    await system1Call({ task: 't', state: 'r2', replay: true }, d);
    const replayDenied = await system1Call(
      { task: 't', state: 'r3', replay: true },
      d
    );
    const production = await system1Call({ task: 't', state: 'p1' }, d);
    expect(replayDenied.status).toBe('over-budget');
    expect(production.status).toBe('ok');
  });
  it('builds few-shot state and picks the tuned version while active', () => {
    expect(
      buildState(
        { preamble: 'P', fewshot: [{ state: 'S', label: 'yes' }] },
        'X'
      )
    ).toContain('Correct answer: yes');
    const reg = registry();
    store.saveVersions('t', {
      active: 'v2',
      previous: null,
      history: [
        {
          id: 'v2',
          spec: { ...reg.tasks.t.baseline, thresholds: { default: 0.8 } },
        },
      ],
    });
    expect(activeVersion(reg, 't', store)).toMatchObject({
      id: 'v2',
      thresholds: { default: 0.8 },
    });
  });
  it('ships a registry whose tasks are internally consistent', () => {
    const real = loadRegistry();
    for (const [id, task] of Object.entries(real.tasks)) {
      expect(task.labels, id).toContain(task.positive);
      const q = task.baseline.questions[task.primary];
      expect(Object.keys(q.criteria).sort(), id).toEqual(
        [...task.labels].sort()
      );
      for (const r of task.baseline.routes)
        expect(real.routes[r], `${id}:${r}`).toBeTruthy();
    }
    expect(stateDir({ JOVIE_SYSTEM1_STATE: '/x' })).toBe('/x');
    expect(stateDir({ LANES_STATE: '/l' })).toBe('/l/system1');
  });
});

describe('call-site adapters', () => {
  it('judges readiness and screenshots, and reports outcomes that join back', async () => {
    const { judgeReadiness, judgeScreenshot, readinessState, recordOutcome } =
      await import('../system1/adapters.mjs');
    const reg = registry();
    reg.tasks['backlog-readiness'] = reg.tasks.t;
    reg.tasks['dogfood-vision'] = {
      ...reg.tasks.t,
      labels: ['defect', 'ok'],
      positive: 'defect',
    };
    reg.tasks['dogfood-vision'].baseline = {
      ...reg.tasks.t.baseline,
      questions: {
        q: {
          type: 'choice',
          instructions: 'i',
          criteria: { defect: 'd', ok: 'o' },
        },
      },
    };
    const deps = {
      registry: reg,
      store,
      now,
      transports: {
        fake: async ({ images }) =>
          images.length ? answer('defect', 0.9) : answer('yes', 0.2),
      },
    };
    expect(
      readinessState({
        title: 'T',
        description: 'D',
        labels: ['codex-blocked'],
        state: 'Rework',
      })
    ).toBe('Title: T\nD');
    // 'yes' at 0.2 with a 0 floor still decides; use a 0.5 floor to see an abstain
    reg.tasks['backlog-readiness'].baseline.thresholds = { default: 0.5 };
    const abstained = await judgeReadiness(
      { identifier: 'JOV-1', title: 'T', description: 'D' },
      deps
    );
    expect(abstained).toMatchObject({ ready: null, status: 'ok' });
    const shot = await judgeScreenshot(
      {
        expectation: 'a profile',
        png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        key: 'sha:profile:phone',
      },
      deps
    );
    expect(shot).toMatchObject({ defect: true, status: 'ok' });
    recordOutcome(
      {
        task: 'dogfood-vision',
        key: 'sha:profile:phone',
        label: 'ok',
        source: 'finding-dismissed',
      },
      { store, now }
    );
    expect(store.labels('dogfood-vision')).toMatchObject([
      { key: 'sha:profile:phone', label: 'ok', source: 'finding-dismissed' },
    ]);
  });
});
