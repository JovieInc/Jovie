import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import {
  alertAction,
  consecutiveRed,
  percentile,
  rollup,
  validateTools,
} from '../tooling-health.mjs';

const now = Date.parse('2026-10-28T20:00:00Z');
const row = (min, tool, ok, ms) => ({
  at: new Date(now - min * 60000).toISOString(),
  tool,
  ok,
  ms,
});

describe('tooling health', () => {
  it('computes percentiles', () => {
    expect(percentile([1, 2, 3, 4, 100], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(percentile([], 50)).toBeNull();
  });
  it('rolls up 24h window and last-good', () => {
    const r = rollup(
      [
        row(2000, 'a', true, 1),
        row(30, 'a', true, 10),
        row(20, 'a', false, 0),
        row(10, 'a', true, 30),
      ],
      now
    );
    expect(r.a.runs24h).toBe(3);
    expect(r.a.okPct24h).toBe(67);
    expect(r.a.p95Ms).toBe(30);
    expect(r.a.lastGood).toBe(new Date(now - 10 * 60000).toISOString());
  });
  it('counts consecutive red and alerts on 2, clears on green', () => {
    const h = [
      row(30, 'a', true, 1),
      row(20, 'a', false, 0),
      row(10, 'a', false, 0),
      row(5, 'b', true, 1),
    ];
    expect(consecutiveRed(h, 'a')).toBe(2);
    expect(alertAction({ red: 1, previousRed: 0 })).toBe('none');
    expect(alertAction({ red: 2, previousRed: 1 })).toBe('red');
    expect(alertAction({ red: 0, previousRed: 3 })).toBe('green');
  });
  it('validates inventory shape', () => {
    expect(
      validateTools([{ tool: 'x', owner: 'o', probe: 'p', cost: 'c' }])
    ).toEqual([]);
    expect(validateTools([{ tool: 'x' }]).length).toBe(3);
  });

  it.each(['transport', 'missing-key'])(
    'retries recovery after %s until Linear acknowledges it',
    async failure => {
      // Run the real probe orchestration with only I/O replaced; no live tools,
      // notifications, credentials or Linear writes are involved.
      const source = readFileSync(
        new URL('../../tooling-health.mjs', import.meta.url),
        'utf8'
      )
        .replace(/^#!.*\n/, '')
        .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '');
      const files = new Map([
        ['/state/history.jsonl', ''],
        [
          '/state/latest.json',
          JSON.stringify({ tools: { gbrain: { consecutiveRed: 2 } } }),
        ],
        [
          '/home/.gbrain/run/query-probe.json',
          JSON.stringify({ at: new Date().toISOString(), status: 'ok' }),
        ],
      ]);
      const resolve = vi.fn().mockResolvedValue({ ok: true });
      if (failure === 'transport')
        resolve.mockResolvedValueOnce({ ok: false, reason: 'transport' });
      const context = vm.createContext({
        process: {
          env: {
            TOOLING_HEALTH_DIR: '/state',
            ...(failure === 'transport' ? { LINEAR_API_KEY: 'fixture' } : {}),
          },
        },
        console: { log() {} },
        homedir: () => '/home',
        join: (...parts) => parts.join('/'),
        mkdirSync() {},
        existsSync: path => files.has(path),
        readFileSync: path => {
          if (!files.has(path)) throw new Error('missing fixture');
          return files.get(path);
        },
        writeFileSync: (path, value) => files.set(path, value),
        appendFileSync: (path, value) =>
          files.set(path, files.get(path) + value),
        spawnSync: () => ({
          status: 0,
          stdout: '{"result":{"protocolVersion":"2024-11-05"}}',
        }),
        alertAction,
        consecutiveRed,
        rollup,
        TOOLING_SCHEMA: 'jovie-tooling-health/v1',
        fileRemediationSignal: vi.fn(),
        resolveRemediationSignal: resolve,
      });
      const tick = () =>
        vm.runInContext(`(async () => {${source}\n})()`, context);
      await tick();
      expect(
        JSON.parse(files.get('/state/latest.json')).tools.gbrain
      ).toMatchObject({
        consecutiveRed: 0,
        recoveryPending: true,
      });
      if (failure === 'transport')
        expect(
          JSON.parse(files.get('/state/latest.json')).tools.gbrain.alert
        ).toBe('recovery-pending');
      context.process.env.LINEAR_API_KEY = 'fixture';
      await tick();
      const attempts = failure === 'transport' ? 2 : 1;
      expect(resolve).toHaveBeenCalledTimes(attempts);
      expect(
        JSON.parse(files.get('/state/latest.json')).tools.gbrain
      ).toMatchObject({
        recoveryPending: false,
        alert: 'resolved',
      });
      await tick();
      expect(resolve).toHaveBeenCalledTimes(attempts);
    }
  );
});
