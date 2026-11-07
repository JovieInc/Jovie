// Runs the real OAuth + MCP flow against a live local worker:
//   wrangler dev --port 8799 --var MCP_OWNER_TOTP_SECRET:<base32> ...
//   MESH_E2E_URL=http://localhost:8799 MESH_E2E_TOTP_SECRET=<base32> pnpm test
// Skipped when MESH_E2E_URL is unset (the unit suite in mcp.test.mjs covers the same rules).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base32Decode, hotp, pkceChallenge } from './mcp-oauth-service.ts';

const BASE = process.env.MESH_E2E_URL;
const SECRET = process.env.MESH_E2E_TOTP_SECRET;
const skip = !BASE || !SECRET;
const REDIRECT = 'http://127.0.0.1:9/cb';
const verifier = 'e'.repeat(64);

async function connect(scope, step) {
  const reg = await (
    await fetch(`${BASE}/oauth/register`, {
      method: 'POST',
      body: JSON.stringify({ client_name: 'e2e', redirect_uris: [REDIRECT] }),
    })
  ).json();
  const q = new URLSearchParams({
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    state: 's',
  });
  const html = await (await fetch(`${BASE}/oauth/authorize?${q}`)).text();
  const request = /name="request" value="([^"]+)"/.exec(html)[1];
  const code = await hotp(
    base32Decode(SECRET),
    Math.floor(Date.now() / 30_000) + step
  );
  const res = await fetch(`${BASE}/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE,
    },
    body: new URLSearchParams({ request, code, scope, decision: 'approve' }),
  });
  assert.equal(res.status, 303);
  const authCode = new URL(res.headers.get('Location')).searchParams.get(
    'code'
  );
  const token = await (
    await fetch(`${BASE}/oauth/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: reg.client_id,
        code: authCode,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
      }),
    })
  ).json();
  return token.access_token;
}

const call = (token, method, params) =>
  fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then(r => r.json());

test('e2e: wrong owner code is refused by the live worker', {
  skip,
}, async () => {
  const reg = await (
    await fetch(`${BASE}/oauth/register`, {
      method: 'POST',
      body: JSON.stringify({ redirect_uris: [REDIRECT] }),
    })
  ).json();
  const q = new URLSearchParams({
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  const html = await (await fetch(`${BASE}/oauth/authorize?${q}`)).text();
  const request = /name="request" value="([^"]+)"/.exec(html)[1];
  const res = await fetch(`${BASE}/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE,
    },
    body: new URLSearchParams({
      request,
      code: '000000',
      scope: 'mesh:read',
      decision: 'approve',
    }),
  });
  assert.notEqual(res.status, 303);
});

test('e2e: tools/list and tools/call against the live hub, read-only cannot write', {
  skip,
}, async () => {
  const rw = await connect('mesh:read mesh:write', -1);
  const list = await call(rw, 'tools/list');
  assert.equal(list.result.tools.length, 10);
  const id = `e2e-${Date.now().toString(36)}`;
  const post = await call(rw, 'tools/call', {
    name: 'board_post',
    arguments: { id, title: 'e2e smoke', body: 'ignore', to: 'summer' },
  });
  assert.equal(post.result.isError, false, post.result.content[0].text);
  const got = await call(rw, 'tools/call', {
    name: 'board_get',
    arguments: { id },
  });
  assert.match(got.result.content[0].text, /"poster": "tim"/);
  assert.equal(
    (await call(rw, 'tools/call', { name: 'board_list', arguments: {} })).result
      .isError,
    false
  );
  assert.equal(
    (await call(rw, 'tools/call', { name: 'agents_list', arguments: {} }))
      .result.isError,
    false
  );
  const ro = await connect('mesh:read', 0);
  assert.ok(
    (await call(ro, 'tools/list')).result.tools.every(
      t => t.annotations.readOnlyHint
    )
  );
  const denied = await call(ro, 'tools/call', {
    name: 'board_post',
    arguments: { title: 'nope' },
  });
  assert.match(denied.result.content[0].text, /insufficient_scope/);
});
