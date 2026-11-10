import assert from 'node:assert/strict';
import { HOTP, Secret } from 'otpauth';
import { sqlite } from '../core.test.mjs';
import { HubError } from '../core.ts';
import { handleMcpHttp } from '../mcp-http.ts';
import { OAuthStore } from '../mcp-oauth.ts';
import {
  callService,
  OAuthService,
  pkceChallenge,
} from '../mcp-oauth-service.ts';

export const ORIGIN = 'https://hub.test';
export const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
// Base32 of the RFC 6238 test key "12345678901234567890".
export const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

export async function currentCode(now) {
  return HOTP.generate({
    secret: Secret.fromBase32(SECRET),
    counter: Math.floor(now / 30_000),
  });
}

export function rig({ secret = SECRET } = {}) {
  const clock = { now: 1_800_000_000_000 };
  const svc = new OAuthService(
    new OAuthStore(sqlite()),
    () => secret,
    () => clock.now
  );
  const calls = [];
  const h = {
    api: async (method, ...args) => {
      const out = await callService(svc, method, args);
      if (!out.ok) throw new HubError(out.status, out.code);
      return out.value;
    },
    backend: async (method, path, body) => {
      calls.push({ method, path, body });
      return { status: 200, json: { ok: true, path } };
    },
  };
  const req = (path, init = {}) => {
    const request = new Request(ORIGIN + path, init);
    return handleMcpHttp(request, new URL(request.url), h);
  };
  return { svc, clock, calls, req };
}

export async function register(r) {
  const res = await r.req('/oauth/register', {
    method: 'POST',
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).client_id;
}

export const verifier = 'v'.repeat(64);

export async function startAuthorize(r, clientId, extra = {}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    state: 'st1',
    ...extra,
  });
  const res = await r.req(`/oauth/authorize?${params}`);
  return res;
}

export async function requestIdFrom(res) {
  const html = await res.text();
  const match = /name="request" value="([^"]+)"/.exec(html);
  assert.ok(match, 'consent page carries a request id');
  return match[1];
}

export function approve(
  r,
  request,
  code,
  scope = 'mesh:read mesh:write',
  origin = ORIGIN
) {
  return r.req('/oauth/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(origin ? { Origin: origin } : {}),
    },
    body: new URLSearchParams({
      request,
      code,
      scope,
      decision: 'approve',
    }).toString(),
  });
}

export async function connect(r, scope) {
  const clientId = await register(r);
  const request = await requestIdFrom(await startAuthorize(r, clientId));
  const res = await approve(r, request, await currentCode(r.clock.now), scope);
  assert.equal(res.status, 303);
  const location = new URL(res.headers.get('Location'));
  assert.equal(location.searchParams.get('state'), 'st1');
  const code = location.searchParams.get('code');
  const token = await r.req('/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }).toString(),
  });
  return { clientId, code, token, body: await token.clone().json() };
}

export const rpc = (r, access, method, params, id = 1) =>
  r.req('/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}` },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
