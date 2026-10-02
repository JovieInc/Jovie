import { oauthProvider } from '@better-auth/oauth-provider';
import { type BetterAuthPlugin, betterAuth } from 'better-auth';
import { describe, expect, it } from 'vitest';
import { MCP_REDIRECT_CLIENT_FAMILIES } from '@/lib/oauth/mcp-redirect-allowlist';
import { mcpOAuthRedirectGuard } from './mcp-redirect-guard';

const ORIGIN = 'https://auth.test';
const AUTH_BASE = `${ORIGIN}/api/auth`;
const FAMILIES = MCP_REDIRECT_CLIENT_FAMILIES;
const CHATGPT = 'https://chatgpt.com/connector/oauth/callback';
const REJECTED = 'https://evilcursor.com/cb';

type ErrorBody = {
  error?: string;
  error_description?: string;
};

function createAuth(allowDynamicClientRegistration: boolean) {
  return betterAuth({
    baseURL: ORIGIN,
    secret: 'better-auth-test-secret-at-least-thirty-two-characters',
    logger: { disabled: true },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    plugins: [
      mcpOAuthRedirectGuard(),
      oauthProvider({
        loginPage: '/identity',
        consentPage: '/identity',
        signup: { page: '/identity' },
        scopes: ['openid', 'profile', 'email', 'offline_access'],
        grantTypes: ['authorization_code', 'refresh_token'],
        disableJwtPlugin: true,
        allowDynamicClientRegistration,
        allowUnauthenticatedClientRegistration: allowDynamicClientRegistration,
        storeTokens: 'hashed',
      }) as BetterAuthPlugin,
    ],
  });
}

async function postJson(
  auth: ReturnType<typeof createAuth>,
  path: string,
  body: unknown
) {
  return auth.handler(
    new Request(`${AUTH_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

async function postForm(
  auth: ReturnType<typeof createAuth>,
  path: string,
  fields: Record<string, string>
) {
  return auth.handler(
    new Request(`${AUTH_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    })
  );
}

async function readError(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

describe('Better Auth MCP redirect guard', () => {
  it('names a rejected registration redirect and the client families', async () => {
    const auth = createAuth(false);
    const response = await postJson(auth, '/oauth2/register', {
      redirect_uris: [CHATGPT, REJECTED],
      client_secret: 'super-secret-value',
    });
    const body = await readError(response);
    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_client_metadata');
    expect(body.error_description).toBe(
      `redirect_uri ${JSON.stringify(REJECTED)} is not allowed. Allowed clients: ${FAMILIES}.`
    );
    expect(JSON.stringify(body)).not.toContain('super-secret-value');
  });

  it('lets an allowlisted registration through when dynamic registration is on', async () => {
    const auth = createAuth(true);
    const response = await postJson(auth, '/oauth2/register', {
      redirect_uris: [CHATGPT],
      client_name: 'ChatGPT',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    });
    const body = (await response.json()) as {
      redirect_uris?: string[];
      error_description?: string;
    };
    expect(body.error_description ?? '').not.toContain('is not allowed');
    expect(response.status).toBe(201);
    expect(body.redirect_uris).toEqual([CHATGPT]);
  });

  it('does not apply the MCP allowlist to a trusted client update', async () => {
    const auth = createAuth(false);
    const response = await postJson(auth, '/oauth2/update-client', {
      client_id: 'logyourbody-ios',
      update: { redirect_uris: ['logyourbody://oauth'] },
    });
    const body = await readError(response);
    expect(body.error_description ?? '').not.toContain('is not allowed');
    expect(body.error_description ?? '').not.toContain('logyourbody://oauth');
  });

  it('names a rejected redirect on client update', async () => {
    const auth = createAuth(false);
    const response = await postJson(auth, '/oauth2/update-client', {
      client_id: 'some-mcp-client',
      update: { redirect_uris: [REJECTED] },
    });
    const body = await readError(response);
    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_client_metadata');
    expect(body.error_description).toContain(REJECTED);
    expect(body.error_description).toContain(FAMILIES);
  });

  it('keeps a trusted native authorize redirect', async () => {
    const auth = createAuth(false);
    const context = await auth.$context;
    await context.adapter.create({
      model: 'oauthClient',
      data: {
        clientId: 'logyourbody-ios',
        disabled: false,
        skipConsent: true,
        scopes: ['openid', 'profile', 'email', 'offline_access'],
        redirectUris: ['logyourbody://oauth'],
        tokenEndpointAuthMethod: 'none',
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        public: true,
        type: 'native',
        requirePKCE: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const authorizeURL = new URL(`${AUTH_BASE}/oauth2/authorize`);
    authorizeURL.searchParams.set('response_type', 'code');
    authorizeURL.searchParams.set('client_id', 'logyourbody-ios');
    authorizeURL.searchParams.set('redirect_uri', 'logyourbody://oauth');
    authorizeURL.searchParams.set('state', 'outer');
    authorizeURL.searchParams.set('code_challenge', 'a'.repeat(43));
    authorizeURL.searchParams.set('code_challenge_method', 'S256');

    const response = await auth.handler(new Request(authorizeURL));
    expect(response.status).toBe(302);
    const target = response.headers.get('location') ?? '';
    expect(target).toContain('/identity');
  });

  it('names a rejected authorize redirect', async () => {
    const auth = createAuth(false);
    const authorizeURL = new URL(`${AUTH_BASE}/oauth2/authorize`);
    authorizeURL.searchParams.set('response_type', 'code');
    authorizeURL.searchParams.set('client_id', 'cursor');
    authorizeURL.searchParams.set('redirect_uri', REJECTED);

    const response = await auth.handler(new Request(authorizeURL));
    const body = await readError(response);
    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_client_metadata');
    expect(body.error_description).toContain(REJECTED);
    expect(body.error_description).toContain(FAMILIES);
  });

  it('names a rejected token redirect and skips trusted clients', async () => {
    const auth = createAuth(false);
    const rejected = await postForm(auth, '/oauth2/token', {
      grant_type: 'authorization_code',
      client_id: 'cursor',
      redirect_uri: REJECTED,
      code: 'x',
    });
    const rejectedBody = await readError(rejected);
    expect(rejected.status).toBe(400);
    expect(rejectedBody.error_description).toContain(REJECTED);

    const trusted = await postForm(auth, '/oauth2/token', {
      grant_type: 'authorization_code',
      client_id: 'logyourbody-ios',
      redirect_uri: 'logyourbody://oauth',
      code: 'x',
    });
    const trustedBody = await readError(trusted);
    expect(trustedBody.error_description ?? '').not.toContain('is not allowed');
  });
});
