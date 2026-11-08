/** OAuth HTTP parsing/consent and authenticated MCP transport; state lives in McpAuth. */
import { HubError } from './core.ts';
import { type Backend, handleRpc, rpcError } from './mcp.ts';
import { OAUTH, type Scope } from './mcp-oauth.ts';
import { type OAuthService, parseScope } from './mcp-oauth-service.ts';

/** Methods the Durable Object exposes; errors come back as values. */
export type Api = <M extends keyof OAuthService>(
  method: M,
  ...args: M extends 'token' ? [string] : Parameters<OAuthService[M]>
) => Promise<Awaited<ReturnType<OAuthService[M]>>>;

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (
  status: number,
  body: unknown,
  extra: Record<string, string> = {}
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
      ...CORS,
      ...extra,
    },
  });
const oauthError = (status: number, error: string) => json(status, { error });

const MAX_FORM = 8_192;
const MAX_MCP = 65_536;

async function readText(request: Request, max: number): Promise<string> {
  const text = await request.text();
  if (text.length > max) throw new HubError(413, 'body_too_large');
  return text;
}

const esc = (value: string) =>
  value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{color-scheme:dark;--bg:#0b0b0c;--panel:#141416;--line:#26262a;--fg:#ededee;--muted:#9a9aa1;--accent:#c9c9d1}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,system-ui,sans-serif;padding:16px}
main{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px}
h1{font-size:18px;margin:0 0 12px}p{color:var(--muted);margin:8px 0}b,code{color:var(--fg)}code{word-break:break-all}
label{display:block;margin:12px 0 4px;color:var(--muted)}input[type=text]{width:100%;padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font-size:18px;letter-spacing:.2em}
.row{display:flex;gap:8px;align-items:center;margin:6px 0;color:var(--fg)}button{margin-top:16px;padding:10px 14px;border-radius:8px;border:1px solid var(--line);background:var(--fg);color:var(--bg);font-size:15px;cursor:pointer}
button.ghost{background:transparent;color:var(--muted);margin-left:8px}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      'X-Frame-Options': 'DENY',
      ...SECURITY_HEADERS,
    },
  });
}

const errorPage = (status: number, message: string) =>
  page(
    status,
    'Cannot continue',
    `<h1>Cannot continue</h1><p>${esc(message)}</p>`
  );

function consentPage(
  requestId: string,
  client: { name: string },
  redirectUri: string,
  scope: Scope[],
  notice = ''
): Response {
  const host = new URL(redirectUri).host;
  const radio = (value: string, label: string, checked: boolean) =>
    `<label class="row"><input type="radio" name="scope" value="${value}"${checked ? ' checked' : ''}> ${label}</label>`;
  const canWrite = scope.includes('mesh:write');
  return page(
    200,
    'Authorize connector',
    `<h1>Connect to the Jovie mesh hub</h1>
<p><b>${esc(client.name)}</b> wants to read and act on the fleet board and mailbox as <b>tim</b>.</p>
<p>After approval it returns to <code>${esc(host)}</code>. Only approve a connector you just added yourself.</p>
${notice ? `<p>${esc(notice)}</p>` : ''}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request" value="${esc(requestId)}">
${radio('mesh:read', 'Read only (board, mailbox, agents)', !canWrite)}
${canWrite ? radio('mesh:read mesh:write', 'Read and write (post, claim, answer, send)', true) : ''}
<label for="code">Owner code from your authenticator app</label>
<input id="code" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required>
<button type="submit" name="decision" value="approve">Approve</button><button class="ghost" type="submit" name="decision" value="deny" formnovalidate>Deny</button>
</form>`
  );
}

function redirectTo(
  base: string,
  params: Record<string, string | null>
): Response {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params))
    if (v !== null) url.searchParams.set(k, v);
  return new Response(null, {
    status: 303,
    headers: { Location: url.toString(), ...SECURITY_HEADERS },
  });
}

type Handlers = { api: Api; backend: Backend };

export async function handleMcpHttp(
  request: Request,
  url: URL,
  h: Handlers
): Promise<Response | null> {
  const path = url.pathname;
  const origin = url.origin;
  if (!/^\/(?:mcp$|oauth\/|\.well-known\/oauth-)/.test(path)) return null;
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: { ...CORS, 'Access-Control-Max-Age': '600' },
    });
  try {
    return await dispatch(request, url, origin, h);
  } catch (error) {
    if (error instanceof HubError) {
      if (path === '/oauth/authorize')
        return errorPage(
          error.status,
          error.code === 'consent_locked'
            ? 'Too many wrong codes. Try again later.'
            : `Request refused (${error.code}).`
        );
      if (path === '/mcp')
        return json(
          error.status,
          { error: error.code },
          error.status === 401 ? { 'WWW-Authenticate': challenge(origin) } : {}
        );
      return oauthError(error.status, mapError(error.code));
    }
    return oauthError(503, 'temporarily_unavailable');
  }
}

const challenge = (origin: string, error?: string) =>
  `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"${error ? `, error="${error}"` : ''}`;

const OAUTH_ERRORS = new Set(
  'invalid_grant invalid_client invalid_scope unsupported_grant_type invalid_redirect_uri invalid_request'.split(
    ' '
  )
);
const mapError = (code: string) =>
  OAUTH_ERRORS.has(code) ? code : 'invalid_request';

async function dispatch(
  request: Request,
  url: URL,
  origin: string,
  h: Handlers
): Promise<Response> {
  const path = url.pathname;
  const method = request.method;
  if (
    method === 'GET' &&
    path.startsWith('/.well-known/oauth-protected-resource')
  )
    return json(200, {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: OAUTH.scopes,
      bearer_methods_supported: ['header'],
    });
  if (method === 'GET' && path === '/.well-known/oauth-authorization-server')
    return json(200, {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: OAUTH.scopes,
    });
  if (method === 'POST' && path === '/oauth/register') {
    let body: unknown;
    try {
      body = JSON.parse(await readText(request, 4_096));
    } catch (error) {
      if (error instanceof HubError) throw error;
      return oauthError(400, 'invalid_client_metadata');
    }
    const out = await h.api('register', body);
    return json(201, {
      ...out,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  }
  if (path === '/oauth/authorize' && method === 'GET')
    return authorizeGet(url, h);
  if (path === '/oauth/authorize' && method === 'POST')
    return authorizePost(request, origin, h);
  if (method === 'POST' && path === '/oauth/token') {
    const form = new URLSearchParams(await readText(request, MAX_FORM));
    const out = await h.api('token', form.toString());
    return json(200, out);
  }
  if (method === 'POST' && path === '/oauth/revoke') {
    const form = new URLSearchParams(await readText(request, MAX_FORM));
    const token = form.get('token');
    if (token && token.length <= 512)
      await h.api('revoke', token, form.get('client_id'));
    return json(200, {});
  }
  if (path === '/mcp') return mcp(request, origin, h);
  return oauthError(404, 'not_found');
}

async function authorizeGet(url: URL, h: Handlers): Promise<Response> {
  const q = url.searchParams;
  if (!(await h.api('ownerConfigured')))
    return errorPage(
      503,
      'Owner verification is not configured on this hub, so no connector can be authorized.'
    );
  const clientId = q.get('client_id') ?? '';
  const redirectUri = q.get('redirect_uri') ?? '';
  const client = await h.api('client', clientId);
  // Never redirect to an unverified URI: these two failures render an error page.
  if (!client) return errorPage(400, 'Unknown client.');
  if (!client.uris.includes(redirectUri))
    return errorPage(400, 'redirect_uri is not registered for this client.');
  const state = q.get('state');
  const fail = (error: string) =>
    redirectTo(redirectUri, { error, state, iss: url.origin });
  if (q.get('response_type') !== 'code')
    return fail('unsupported_response_type');
  if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge'))
    return fail('invalid_request');
  const resource = q.get('resource');
  if (resource && resource !== `${url.origin}/mcp`)
    return fail('invalid_target');
  let scope: Scope[];
  try {
    scope = parseScope(q.get('scope'), OAUTH.scopes);
  } catch {
    return fail('invalid_scope');
  }
  const begun = await h.api('begin', {
    clientId,
    redirectUri,
    state: state && state.length <= 512 ? state : null,
    challenge: q.get('code_challenge') ?? '',
    scope,
  });
  return consentPage(begun, client, redirectUri, scope);
}

async function authorizePost(
  request: Request,
  origin: string,
  h: Handlers
): Promise<Response> {
  // Browsers always send Origin on form POSTs; require it to be this hub.
  if (
    request.headers.get('Origin') !== origin &&
    request.headers.get('Sec-Fetch-Site') !== 'same-origin'
  )
    return errorPage(403, 'Cross-site request refused.');
  const form = new URLSearchParams(await readText(request, MAX_FORM));
  const requestId = form.get('request') ?? '';
  const pending = await h.api('pending', requestId);
  if (!pending)
    return errorPage(
      400,
      'This approval request expired. Start again from the connector.'
    );
  if (form.get('decision') === 'deny') {
    await h.api('deny', requestId);
    return redirectTo(pending.redirectUri, {
      error: 'access_denied',
      state: pending.state,
      iss: origin,
    });
  }
  let scope: Scope[];
  try {
    scope = parseScope(form.get('scope'), []);
  } catch {
    return errorPage(400, 'Invalid scope.');
  }
  try {
    const out = await h.api(
      'consent',
      requestId,
      form.get('code') ?? '',
      scope
    );
    return redirectTo(out.redirectUri, {
      code: out.code,
      state: out.state,
      iss: origin,
    });
  } catch (error) {
    if (error instanceof HubError && error.code === 'invalid_owner_code')
      return consentPage(
        requestId,
        pending.client,
        pending.redirectUri,
        pending.scope,
        'That code was not accepted.'
      );
    throw error;
  }
}

async function mcp(
  request: Request,
  origin: string,
  h: Handlers
): Promise<Response> {
  const header = request.headers.get('Authorization') ?? '';
  const token = /^Bearer (mcp_at_[A-Za-z0-9_-]{20,128})$/.exec(header)?.[1];
  if (!token)
    return json(
      401,
      { error: 'unauthorized' },
      { 'WWW-Authenticate': challenge(origin) }
    );
  const principal = await h.api('authenticate', token);
  if (!principal)
    return json(
      401,
      { error: 'invalid_token' },
      { 'WWW-Authenticate': challenge(origin, 'invalid_token') }
    );
  if (request.method !== 'POST')
    return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  let body: unknown;
  try {
    body = JSON.parse(await readText(request, MAX_MCP));
  } catch (error) {
    if (error instanceof HubError) throw error;
    return json(400, rpcError(null, -32700, 'Parse error'));
  }
  const ctx = {
    scope: principal.scope,
    backend: h.backend,
    allowWrite: () => h.api('allowWrite', principal.grantId),
  };
  if (Array.isArray(body))
    return json(400, rpcError(null, -32600, 'Invalid Request'));
  const out = await handleRpc(body, ctx);
  return out
    ? json(200, out)
    : new Response(null, {
        status: 202,
        headers: { ...SECURITY_HEADERS, ...CORS },
      });
}
