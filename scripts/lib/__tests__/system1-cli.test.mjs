import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../../system1.mjs';
import { activeVersion, system1Call } from '../system1/router.mjs';
import { createStore } from '../system1/store.mjs';

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
  },
  tasks: {
    'backlog-readiness': {
      retainInput: true,
      primary: 'q',
      labels: ['ready', 'not_ready'],
      positive: 'ready',
      objective: 'f1',
      guardrails: { minPrecision: 0.8 },
      minHeldout: 5,
      baseline: {
        routes: ['a'],
        preamble: 'P',
        questions: {
          q: {
            type: 'choice',
            instructions: 'i',
            criteria: { ready: 'y', not_ready: 'n' },
          },
        },
        thresholds: { default: 0 },
        fewshot: [],
      },
    },
  },
});

let dir;
let store;
let now;
let written;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 's1cli-'));
  store = createStore(dir);
  now = (() => {
    let t = Date.parse('2026-10-25T00:00:00Z');
    return () => (t += 1000);
  })();
  written = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
    written.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const answer = (choice, p) => ({
  answers: { q: { type: 'choice', choice, probabilities: { [choice]: p } } },
  inputTokens: 1000,
  outputTokens: 0,
});

describe('system1 CLI', () => {
  it('weekly joins outcomes, tunes offline without a credential, and writes the report', async () => {
    const reg = registry();
    const deps = {
      registry: reg,
      store,
      now,
      transports: {
        fake: async ({ state }) =>
          state.includes('FP') ? answer('ready', 0.6) : answer('ready', 0.9),
      },
    };
    const issues = [];
    for (let i = 0; i < 80; i++) {
      const positive = i % 2 === 0;
      const falsePositive = !positive && i % 4 === 1;
      const key = `JOV-${i}`;
      await system1Call(
        {
          task: 'backlog-readiness',
          state: `${key}${falsePositive ? ' FP' : ''}`,
          key,
        },
        deps
      );
      // negatives that are not false positives are called "no" by the model
      if (!positive && !falsePositive) {
        store.appendCall({
          ...store.calls({ task: 'backlog-readiness' }).at(-1),
          callId: `x${i}`,
          choice: 'not_ready',
          decision: 'not_ready',
          probabilities: { not_ready: 0.9 },
          ts: new Date(now()).toISOString(),
        });
      }
      issues.push({
        identifier: key,
        state: positive ? 'Merging' : 'Rework',
        labels: [],
      });
    }
    const code = await main(['weekly'], {
      ...deps,
      issues,
      env: {},
      callDeps: { transports: deps.transports },
    });
    expect(code).toBe(0);
    const report = store.report();
    expect(report.replay).toBe('off');
    expect(report.outcomeJoin[0]).toMatchObject({ matched: 80, appended: 80 });
    expect(report.tuning[0]).toMatchObject({ task: 'backlog-readiness' });
    expect(report.tuning[0].status).toBe('promoted');
    {
      expect(activeVersion(reg, 'backlog-readiness', store).id).toBe(
        report.tuning[0].promoted
      );
      const rolled = await main(['rollback', '--task', 'backlog-readiness'], {
        ...deps,
      });
      expect(rolled).toBe(0);
      expect(activeVersion(reg, 'backlog-readiness', store).id).toBe('v1');
    }
  });

  it('labels from the command line and rejects an incomplete label', async () => {
    const reg = registry();
    await main(
      [
        'label',
        '--task',
        'backlog-readiness',
        '--key',
        'JOV-9',
        '--label',
        'ready',
        '--source',
        'cli',
      ],
      { registry: reg, store, now }
    );
    expect(store.labels('backlog-readiness')[0]).toMatchObject({
      key: 'JOV-9',
      label: 'ready',
      source: 'cli',
    });
    await expect(
      main(['label', '--task', 'backlog-readiness'], {
        registry: reg,
        store,
        now,
      })
    ).rejects.toThrow(/label needs/);
    expect(await main(['nope'], { registry: reg, store, now })).toBe(2);
  });
});
