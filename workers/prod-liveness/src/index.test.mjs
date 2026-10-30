import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextState, probe, run } from './index.ts';

const res = (status, headers = {}) => new Response('', { status, headers });
test('probe classifies a paused deployment, quota, http failure and network error', async () => {
  assert.equal(
    (
      await probe('https://x', async () =>
        res(503, { 'x-vercel-error': 'DEPLOYMENT_PAUSED' })
      )
    ).cause,
    'paused'
  );
  assert.equal((await probe('https://x', async () => res(402))).cause, 'quota');
  assert.equal((await probe('https://x', async () => res(500))).cause, 'http');
  assert.equal(
    (
      await probe('https://x', async () => {
        throw new Error('x');
      })
    ).cause,
    'network'
  );
  assert.equal((await probe('https://x', async () => res(200))).ok, true);
});
test('pages after two failing minutes, re-pages after 30 minutes, then recovers once', () => {
  const bad = [{ ok: false }],
    good = [{ ok: true }];
  let s = { failures: 0, pagedAt: null };
  let r = nextState(s, bad, 0, 2);
  assert.equal(r.page, null);
  s = r.state;
  r = nextState(s, bad, 60_000, 2);
  assert.equal(r.page, 'down');
  s = r.state;
  r = nextState(s, bad, 120_000, 2);
  assert.equal(r.page, null);
  s = r.state;
  r = nextState(s, bad, 60_000 + 30 * 60_000, 2);
  assert.equal(r.page, 'still-down');
  s = r.state;
  r = nextState(s, good, 40 * 60_000, 2);
  assert.equal(r.page, 'recovered');
  assert.equal(nextState(r.state, good, 41 * 60_000, 2).page, null);
});
test('run pages every configured channel at once and reports undelivered pages', async () => {
  const store = new Map();
  const STATE = {
    get: async k => store.get(k) ?? null,
    put: async (k, v) => {
      store.set(k, v);
    },
  };
  const posts = [];
  const f = async (u, init) => {
    if (init?.method === 'POST') {
      posts.push(u);
      return res(200);
    }
    return res(503, { 'x-vercel-error': 'DEPLOYMENT_PAUSED' });
  };
  const env = {
    STATE,
    TARGETS: 'https://jov.ie/',
    FAILURES_TO_PAGE: '1',
    PAGE_URLS: 'https://a.example/h,https://b.example/h',
  };
  const out = await run(env, 1000, f);
  assert.equal(out.page, 'down');
  assert.deepEqual(posts, ['https://a.example/h', 'https://b.example/h']);
  assert.equal(out.delivered, 2);
  const none = await run(
    {
      STATE: { get: async () => null, put: async () => {} },
      TARGETS: 'https://jov.ie/',
      FAILURES_TO_PAGE: '1',
    },
    1000,
    f
  );
  assert.equal(none.channels, 0);
});

test('emails once per incident (down and recovery, not re-pages) and pages Summer with a signature', async () => {
  const store = new Map();
  const STATE = {
    get: async k => store.get(k) ?? null,
    put: async (k, v) => {
      store.set(k, v);
    },
  };
  const calls = [];
  let up = false;
  const f = async (u, init) => {
    if (init?.method === 'POST') {
      calls.push([u, init]);
      return new Response('{}', { status: 200 });
    }
    return up
      ? new Response('', { status: 200 })
      : new Response('', {
          status: 503,
          headers: { 'x-vercel-error': 'DEPLOYMENT_PAUSED' },
        });
  };
  const env = {
    STATE,
    TARGETS: 'https://jov.ie/',
    FAILURES_TO_PAGE: '1',
    SUMMER_PAGE_URL: 'https://summer.example/summer/v1/events/liveness',
    SUMMER_LIVENESS_SECRET: 's',
    RESEND_API_KEY: 'k',
    EMAIL_TO: 'tim@jov.ie',
  };
  await run(env, 1_000, f);
  const emails = () => calls.filter(c => c[0].includes('resend.com'));
  assert.equal(emails().length, 1);
  const summer = calls.find(c => c[0].includes('summer.example'));
  assert.match(summer[1].headers['x-liveness-signature'], /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(summer[1].body).incident, '1000');
  await run(env, 40 * 60_000, f); // re-page: Summer again, no new email
  assert.equal(emails().length, 1);
  up = true;
  await run(env, 41 * 60_000, f);
  assert.equal(emails().length, 2);
  assert.equal(
    JSON.parse(
      calls.filter(c => c[0].includes('summer.example')).at(-1)[1].body
    ).incident,
    '1000'
  );
});
