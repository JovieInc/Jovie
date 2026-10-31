import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextState, probe, run } from './index.ts';

const res = (status, headers = {}) => ({ status, headers: new Headers(headers) });
const fresh = { failures: 0, pagedAt: null };

test('probe: healthy, paused deployment, quota and network errors are told apart', async () => {
  assert.equal((await probe('https://x', async () => res(200))).cause, 'ok');
  assert.equal((await probe('https://x', async () => res(503, { 'x-vercel-error': 'DEPLOYMENT_PAUSED' }))).cause, 'paused');
  assert.equal((await probe('https://x', async () => res(402))).cause, 'quota');
  assert.equal((await probe('https://x', async () => res(500))).cause, 'http');
  assert.equal((await probe('https://x', async () => { throw new Error('down'); })).cause, 'network');
});

test('negative control: a down site pages on the second failing minute, not before; healthy never pages', () => {
  const bad = [{ url: 'u', ok: false, status: 0, cause: 'network' }];
  const ok = [{ url: 'u', ok: true, status: 200, cause: 'ok' }];
  const one = nextState(fresh, bad, 1000, 2);
  assert.equal(one.page, null);
  const two = nextState(one.state, bad, 61_000, 2);
  assert.equal(two.page, 'down', 'time to detect = 2 failing minutes');
  assert.equal(nextState(two.state, bad, 120_000, 2).page, null, 'no page storm');
  assert.equal(nextState(two.state, bad, 61_000 + 30 * 60_000, 2).page, 'still-down');
  assert.equal(nextState(two.state, ok, 200_000, 2).page, 'recovered');
  assert.equal(nextState(fresh, ok, 1, 2).page, null);
});

test('run: a paused site is paged through every configured channel', async () => {
  const kv = new Map();
  const env = {
    TARGETS: 'https://jov.ie/',
    FAILURES_TO_PAGE: '1',
    PAGE_URLS: 'https://hooks.example/page',
    STATE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    return url === 'https://jov.ie/' ? res(503, { 'x-vercel-error': 'DEPLOYMENT_PAUSED' }) : { ...res(200), ok: true };
  };
  const out = await run(env, 1000, fetchImpl);
  assert.equal(out.page, 'down');
  assert.ok(calls.includes('https://hooks.example/page'));
  assert.equal(out.delivered, 1);
});
