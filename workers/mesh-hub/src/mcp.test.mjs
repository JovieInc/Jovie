import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  approve,
  connect,
  currentCode,
  ORIGIN,
  REDIRECT,
  register,
  requestIdFrom,
  rig,
  rpc,
  SECRET,
  startAuthorize,
  verifier,
} from './fixtures/mcp.mjs';
import { OAUTH } from './mcp-oauth.ts';
import { b64url, totpCandidates } from './mcp-oauth-service.ts';

test('TOTP matches the RFC 6238 vector', async () => {
  assert.equal((await totpCandidates(SECRET, 59_000))[1].code, '287082');
});

test('discovery documents advertise S256 PKCE, DCR and public clients', async () => {
  const r = rig();
  const meta = await (
    await r.req('/.well-known/oauth-authorization-server')
  ).json();
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  assert.equal(meta.registration_endpoint, `${ORIGIN}/oauth/register`);
  const prm = await (
    await r.req('/.well-known/oauth-protected-resource/mcp')
  ).json();
  assert.equal(prm.resource, `${ORIGIN}/mcp`);
});

test('no consent means no code: nothing is issued before the owner proves presence', async () => {
  const r = rig();
  const clientId = await register(r);
  const res = await startAuthorize(r, clientId);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Location'), null);
  assert.match(
    res.headers.get('Content-Security-Policy'),
    /frame-ancestors 'none'/
  );
  const request = await requestIdFrom(res);
  // Wrong code, no code, cross-site POST: none may yield a redirect with a code.
  for (const attempt of [
    approve(r, request, '000000'),
    approve(r, request, ''),
    approve(
      r,
      request,
      await currentCode(r.clock.now),
      undefined,
      'https://evil.test'
    ),
    approve(r, request, await currentCode(r.clock.now), undefined, null),
  ]) {
    const out = await attempt;
    assert.notEqual(out.status, 303);
    assert.equal(out.headers.get('Location'), null);
  }
  // The tokens endpoint has nothing to exchange.
  const token = await r.req('/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: 'guess',
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }).toString(),
  });
  assert.equal(token.status, 400);
});

test('the wrong user is refused and repeated misses lock consent even for the right code', async () => {
  const r = rig();
  const clientId = await register(r);
  const request = await requestIdFrom(await startAuthorize(r, clientId));
  for (let i = 0; i < OAUTH.consentFailsShort; i++) {
    const out = await approve(r, request, '123456');
    assert.equal(out.status === 200 || out.status === 403, true);
  }
  const right = await approve(r, request, await currentCode(r.clock.now));
  assert.equal(right.status, 429);
  assert.equal(right.headers.get('Location'), null);
  r.clock.now += OAUTH.consentShortMs + 1;
  const later = await approve(r, request, await currentCode(r.clock.now));
  // The request itself expired (10 min), so it is still not an approval.
  assert.notEqual(later.status, 303);
});

test('a hub with no owner secret refuses every authorization', async () => {
  const r = rig({ secret: null });
  const clientId = await register(r);
  const res = await startAuthorize(r, clientId);
  assert.equal(res.status, 503);
});

test('an owner code cannot be replayed for a second approval', async () => {
  const r = rig();
  const clientId = await register(r);
  const code = await currentCode(r.clock.now);
  const one = await requestIdFrom(await startAuthorize(r, clientId));
  const two = await requestIdFrom(await startAuthorize(r, clientId));
  assert.equal((await approve(r, one, code)).status, 303);
  assert.notEqual((await approve(r, two, code)).status, 303);
});

test('authorize rejects unregistered redirect_uri without redirecting, and non-S256 PKCE', async () => {
  const r = rig();
  const clientId = await register(r);
  const bad = await startAuthorize(r, clientId, {
    redirect_uri: 'https://evil.test/cb',
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.headers.get('Location'), null);
  const plain = await startAuthorize(r, clientId, {
    code_challenge_method: 'plain',
  });
  assert.equal(plain.status, 303);
  assert.equal(
    new URL(plain.headers.get('Location')).searchParams.get('error'),
    'invalid_request'
  );
});

test('DCR validates redirect URIs and caps registrations', async () => {
  const r = rig();
  const post = uris =>
    r.req('/oauth/register', {
      method: 'POST',
      body: JSON.stringify({ redirect_uris: uris }),
    });
  assert.equal((await post(['javascript:alert(1)'])).status, 400);
  assert.equal((await post(['http://evil.test/cb'])).status, 400);
  assert.equal((await post([])).status, 400);
  assert.equal((await post(['http://127.0.0.1:8080/cb'])).status, 201);
  let last = 201;
  for (let i = 0; i < OAUTH.registrationsPerHour; i++)
    last = (await post([REDIRECT])).status;
  assert.equal(last, 429);
});

test('code is single use, PKCE-bound, and reuse revokes what it produced', async () => {
  const r = rig();
  const { clientId, code, token, body } = await connect(r);
  assert.equal(token.status, 200);
  assert.equal(body.token_type, 'Bearer');
  assert.equal(body.expires_in, 3600);
  const form = extra =>
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      ...extra,
    }).toString();
  const replay = await r.req('/oauth/token', {
    method: 'POST',
    body: form({}),
  });
  assert.equal(replay.status, 400);
  const probe = await rpc(r, body.access_token, 'ping');
  assert.equal(probe.status, 401, 'replay revoked the grant');
});

test('wrong PKCE verifier is refused', async () => {
  const r = rig();
  const clientId = await register(r);
  const request = await requestIdFrom(await startAuthorize(r, clientId));
  const res = await approve(r, request, await currentCode(r.clock.now));
  const code = new URL(res.headers.get('Location')).searchParams.get('code');
  const out = await r.req('/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT,
      code_verifier: 'w'.repeat(64),
    }).toString(),
  });
  assert.equal(out.status, 400);
});

test('refresh rotates, tokens expire, and a reused refresh token kills the grant', async () => {
  const r = rig();
  const { clientId, body } = await connect(r);
  const refresh = rt =>
    r.req('/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: rt,
      }).toString(),
    });
  const next = await refresh(body.refresh_token);
  assert.equal(next.status, 200);
  const rotated = await next.json();
  assert.notEqual(rotated.refresh_token, body.refresh_token);
  r.clock.now += OAUTH.accessTtlMs + 1;
  assert.equal((await rpc(r, body.access_token, 'ping')).status, 401);
  assert.equal((await refresh(body.refresh_token)).status, 400);
  assert.equal(
    (await rpc(r, rotated.access_token, 'ping')).status,
    401,
    'reuse revoked the grant'
  );
});

test('revocation ends the grant', async () => {
  const r = rig();
  const { clientId, body } = await connect(r);
  assert.equal((await rpc(r, body.access_token, 'ping')).status, 200);
  await r.req('/oauth/revoke', {
    method: 'POST',
    body: new URLSearchParams({
      token: body.refresh_token,
      client_id: clientId,
    }).toString(),
  });
  assert.equal((await rpc(r, body.access_token, 'ping')).status, 401);
});

test('/mcp requires a token and points at the resource metadata', async () => {
  const r = rig();
  const res = await r.req('/mcp', { method: 'POST', body: '{}' });
  assert.equal(res.status, 401);
  assert.match(
    res.headers.get('WWW-Authenticate'),
    /resource_metadata=".*oauth-protected-resource"/
  );
  const forged = await rpc(r, `mcp_at_${'a'.repeat(43)}`, 'ping');
  assert.equal(forged.status, 401);
});

test('tools/list and tools/call smoke with a read+write token', async () => {
  const r = rig();
  const { body } = await connect(r, 'mesh:read mesh:write');
  const init = await (
    await rpc(r, body.access_token, 'initialize', {
      protocolVersion: '2025-06-18',
    })
  ).json();
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const list = await (await rpc(r, body.access_token, 'tools/list')).json();
  assert.deepEqual(list.result.tools.map(t => t.name).sort(), [
    'agents_list',
    'board_answer',
    'board_claim',
    'board_done',
    'board_get',
    'board_list',
    'board_post',
    'board_update',
    'mailbox_read',
    'mailbox_send',
  ]);
  const get = await (
    await rpc(r, body.access_token, 'tools/call', {
      name: 'board_get',
      arguments: { id: 'fc-1' },
    })
  ).json();
  assert.equal(get.result.isError, false);
  assert.deepEqual(r.calls.at(-1), {
    method: 'GET',
    path: '/v1/board/task?id=fc-1',
    body: undefined,
  });
  await rpc(r, body.access_token, 'tools/call', {
    name: 'board_post',
    arguments: { title: 'T', evil: 1 },
  });
  assert.deepEqual(r.calls.at(-1), {
    method: 'POST',
    path: '/v1/board/post',
    body: { title: 'T' },
  });
  await rpc(r, body.access_token, 'tools/call', {
    name: 'mailbox_send',
    arguments: { to: 'summer', body: 'hi' },
  });
  const sent = r.calls.at(-1);
  assert.equal(sent.path, '/v1/send');
  assert.match(sent.body.correlationId, /^tim-mcp-[a-f0-9-]+$/);
  assert.match(sent.body.sha256, /^[a-f0-9]{64}$/);
  const notification = await r.req('/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${body.access_token}` },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  assert.equal(notification.status, 202);
});

test('a read-only token cannot write and never reaches the hub for a write', async () => {
  const r = rig();
  const { body } = await connect(r, 'mesh:read');
  assert.equal(body.scope, 'mesh:read');
  const list = await (await rpc(r, body.access_token, 'tools/list')).json();
  assert.ok(list.result.tools.every(t => t.annotations.readOnlyHint));
  for (const [name, args] of [
    ['board_post', { title: 'x' }],
    ['board_claim', { id: 'a' }],
    ['board_done', { id: 'a', result: 'x' }],
    ['mailbox_send', { to: 'summer', body: 'x' }],
  ]) {
    const out = await (
      await rpc(r, body.access_token, 'tools/call', { name, arguments: args })
    ).json();
    assert.equal(out.result.isError, true);
    assert.match(out.result.content[0].text, /insufficient_scope/);
  }
  const before = r.calls.length;
  const ack = await (
    await rpc(r, body.access_token, 'tools/call', {
      name: 'mailbox_read',
      arguments: { ack: true },
    })
  ).json();
  assert.match(ack.result.content[0].text, /insufficient_scope/);
  assert.equal(r.calls.length, before + 1, 'only the read happened');
  assert.equal(
    r.calls.every(c => c.method === 'GET'),
    true
  );
});

test('consent cannot widen the scope the client asked for', async () => {
  const r = rig();
  const clientId = await register(r);
  const request = await requestIdFrom(
    await startAuthorize(r, clientId, { scope: 'mesh:read' })
  );
  const res = await approve(
    r,
    request,
    await currentCode(r.clock.now),
    'mesh:read mesh:write'
  );
  assert.notEqual(res.status, 303);
});

test('write calls are rate limited per grant', async () => {
  const r = rig();
  const { body } = await connect(r, 'mesh:read mesh:write');
  let limited = 0;
  for (let i = 0; i < OAUTH.writesPerMinute + 3; i++) {
    const out = await (
      await rpc(
        r,
        body.access_token,
        'tools/call',
        { name: 'board_claim', arguments: { id: 'a' } },
        i + 2
      )
    ).json();
    if (/write_rate_limited/.test(out.result.content[0].text)) limited++;
  }
  assert.equal(limited, 3);
});

test('b64url helper', () => {
  assert.equal(b64url(new Uint8Array([251, 255])), '-_8');
});

test('a client older than a day is not pruned while it authorizes; same-origin fetch metadata is accepted', async () => {
  const r = rig();
  const clientId = await register(r);
  r.clock.now += 2 * 86_400_000;
  const request = await requestIdFrom(await startAuthorize(r, clientId));
  const res = await r.req('/oauth/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Sec-Fetch-Site': 'same-origin',
      Origin: 'null',
    },
    body: new URLSearchParams({
      request,
      code: await currentCode(r.clock.now),
      scope: 'mesh:read',
      decision: 'approve',
    }).toString(),
  });
  assert.equal(res.status, 303);
  const consent = await startAuthorize(r, clientId);
  assert.equal(consent.headers.get('Referrer-Policy'), 'same-origin');
});

test('MCP 2025-06-18 refuses JSON-RPC batches without executing tools', async () => {
  const r = rig();
  const { body } = await connect(r, 'mesh:read mesh:write');
  const res = await r.req('/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${body.access_token}` },
    body: JSON.stringify([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'board_post', arguments: { title: 'never run' } },
      },
    ]),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, -32600);
  assert.equal(r.calls.length, 0);
});

test('one owner guessing budget survives client churn; consent locks preserve existing grants and expire', async () => {
  const r = rig();
  const active = await connect(r, 'mesh:read');
  const attacker = await register(r);
  const pending = await requestIdFrom(await startAuthorize(r, attacker));
  for (let i = 0; i < OAUTH.consentFailsShort; i++)
    await approve(r, pending, 'invalid');
  const another = await register(r);
  const next = await requestIdFrom(await startAuthorize(r, another));
  assert.equal(
    (await approve(r, next, 'invalid')).status,
    429,
    'DCR cannot multiply guesses against the same owner secret'
  );
  assert.equal((await rpc(r, active.body.access_token, 'ping')).status, 200);
  const list = await (
    await rpc(r, active.body.access_token, 'tools/list')
  ).json();
  assert.ok(list.result.tools.length > 0);
  assert.ok(list.result.tools.every(tool => tool.annotations.readOnlyHint));
  r.clock.now += OAUTH.consentShortMs + 1;
  const fresh = await requestIdFrom(await startAuthorize(r, another));
  assert.equal(
    (await approve(r, fresh, await currentCode(r.clock.now), 'mesh:read'))
      .status,
    303
  );
});
