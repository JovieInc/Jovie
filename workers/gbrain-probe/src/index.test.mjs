import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextState, tick } from './index.ts';

const ok = { ok: true, servedVersion: '0.46.28.0', latencyMs: { search: 5 } };
const bad = { ok: false, error: 'search: HTTP 530' };

test('one failure is degraded, two consecutive failures are down, observedAt freezes', () => {
  const a = nextState(null, '2026-10-31T00:00:00Z', ok);
  assert.equal(a.status, 'verified');
  const b = nextState(a, '2026-10-31T00:05:00Z', bad);
  assert.equal(b.status, 'degraded');
  assert.equal(b.observedAt, '2026-10-31T00:00:00Z');
  const c = nextState(b, '2026-10-31T00:10:00Z', bad);
  assert.equal(c.status, 'down');
  assert.equal(c.consecutiveFailures, 2);
  assert.equal(c.observedAt, '2026-10-31T00:00:00Z');
  const d = nextState(c, '2026-10-31T00:15:00Z', ok);
  assert.equal(d.status, 'verified');
  assert.equal(d.consecutiveFailures, 0);
});

function kv() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
const mcpBody = (text) => `event: message\ndata: ${JSON.stringify({ result: { content: [{ text }] } })}\n`;

test('tick: green path then outage; alert fires once per 30 min', async () => {
  let up = true;
  const alerts = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('alert')) { alerts.push(1); return new Response('ok'); }
    if (!up) return new Response('x', { status: 530 });
    if (String(url).endsWith('/health')) return Response.json({ status: 'ok', version: '0.46.28.0' });
    return new Response(mcpBody('[{"slug":"a"}]'));
  };
  const env = { STATE: kv(), GBRAIN_PROBE_TOKEN: 't', ALERT_WEBHOOK_URL: 'https://alert.example/hook' };
  let s = await tick(env, '2026-10-31T00:00:00Z');
  assert.equal(s.status, 'verified');
  up = false;
  s = await tick(env, '2026-10-31T00:05:00Z');
  assert.equal(s.status, 'degraded');
  s = await tick(env, '2026-10-31T00:10:00Z');
  assert.equal(s.status, 'down');
  assert.equal(alerts.length, 1);
  s = await tick(env, '2026-10-31T00:15:00Z');
  assert.equal(alerts.length, 1);
  s = await tick(env, '2026-10-31T00:45:00Z');
  assert.equal(alerts.length, 2);
});

test('empty search result is a failure (fails closed)', async () => {
  globalThis.fetch = async (url) => String(url).endsWith('/health') ? Response.json({ status: 'ok', version: 'v' }) : new Response(mcpBody('[]'));
  const s = await tick({ STATE: kv(), GBRAIN_PROBE_TOKEN: 't' }, '2026-10-31T00:00:00Z');
  assert.equal(s.status, 'degraded');
});
