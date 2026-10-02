import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
} from '@better-auth/oauth-provider';
import { type BetterAuthPlugin, betterAuth } from 'better-auth';
import { afterEach, describe, expect, it } from 'vitest';
import { MCP_REDIRECT_CLIENT_FAMILIES } from '@/lib/oauth/mcp-redirect-allowlist';
import { mcpDynamicClientRegistrationOptions } from './mcp-dynamic-registration';
import { mcpOAuthRedirectGuard } from './mcp-redirect-guard';

const ORIGIN = 'https://auth.test';
const AUTH_BASE = `${ORIGIN}/api/auth`;
const FAMILIES = MCP_REDIRECT_CLIENT_FAMILIES;
const CURSOR_APP = 'cursor://anysphere.cursor-mcp/oauth/callback';

const ALLOWED = [
  'https://chatgpt.com/connector/oauth/callback',
  'https://claude.ai/api/mcp/auth_callback',
  'https://www.cursor.com/agents/mcp/oauth/callback',
  CURSOR_APP,
  'https://vscode.dev/redirect',
  'https://insiders.vscode.dev/redirect',
  'http://127.0.0.1:33418/',
  'http://localhost:8787/callback',
  'https://127.0.0.1/callback',
  'http://[::1]:3118/callback',
] as const;

const REJECTED = [
  'https://evilcursor.com/cb',
  'cursor://evil.example/oauth/callback',
  'cursor://anysphere.cursor-mcp/oauth/other',
  'cursor://anysphere.cursor-mcp/oauth/callback?next=1',
  'cursor://anysphere.cursor-mcp/oauth/appname/callback',
  'myapp://oauth/callback',
] as const;

type ErrorBody = {
  error?: string;
  error_description?: string;
  registration_endpoint?: string;
  redirect_uris?: string[];
  client_id?: string;
};

function createAuth(enabled: boolean) {
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
        ...mcpDynamicClientRegistrationOptions(enabled),
        storeTokens: 'hashed',
      }) as BetterAuthPlugin,
    ],
  });
}

function registrationBody(
  redirectUris: readonly string[],
  extra: Record<string, unknown> = {}
) {
  return {
    redirect_uris: [...redirectUris],
    client_name: 'MCP client',
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    ...extra,
  };
}

async function postRegister(
  auth: ReturnType<typeof createAuth>,
  body: unknown
) {
  return auth.handler(
    new Request(`${AUTH_BASE}/oauth2/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

async function readJson(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

async function discovery(auth: ReturnType<typeof createAuth>) {
  // The oauthProvider() cast used to build the harness erases endpoint types.
  const metadata = oauthProviderAuthServerMetadata(
    auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0]
  );
  const response = await metadata(
    new Request(`${ORIGIN}/.well-known/oauth-authorization-server`)
  );
  return { response, body: await readJson(response) };
}

describe('MCP dynamic client registration flag', () => {
  afterEach(() => {
    delete process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION;
  });

  it('defaults both registration switches off', () => {
    expect(mcpDynamicClientRegistrationOptions()).toEqual({
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
    });
  });

  it('turns both registration switches on together', () => {
    process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION = 'true';
    expect(mcpDynamicClientRegistrationOptions()).toEqual({
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    });
  });

  it('does not advertise registration_endpoint when the flag is off', async () => {
    const { response, body } = await discovery(createAuth(false));
    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty('registration_endpoint');
  });

  it('advertises registration_endpoint when the flag is on', async () => {
    const { response, body } = await discovery(createAuth(true));
    expect(response.status).toBe(200);
    expect(body.registration_endpoint).toBe(`${AUTH_BASE}/oauth2/register`);
  });

  it('keeps dynamic registration closed when the flag is off', async () => {
    const response = await postRegister(
      createAuth(false),
      registrationBody([ALLOWED[0]])
    );
    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body.client_id).toBeUndefined();
    expect(body.error_description).toMatch(/disabled/i);
  });

  it.each(ALLOWED)(
    'accepts allowlisted redirect %s when the flag is on',
    async uri => {
      const response = await postRegister(
        createAuth(true),
        registrationBody([uri])
      );
      const body = await readJson(response);
      expect(body.error_description ?? '').not.toContain('is not allowed');
      expect(response.status).toBe(201);
      expect(body.redirect_uris).toEqual([uri]);
    }
  );

  it('accepts Cursor host-bearing callback together with its https and loopback URIs', async () => {
    const redirects = [
      CURSOR_APP,
      'https://www.cursor.com/agents/mcp/oauth/callback',
      'http://localhost:8787/callback',
    ];
    const response = await postRegister(
      createAuth(true),
      registrationBody(redirects, {
        application_type: 'web',
        client_name: 'Cursor',
      })
    );
    const body = await readJson(response);
    expect(response.status).toBe(201);
    expect(body.redirect_uris).toEqual(redirects);
  });

  it.each(REJECTED)(
    'returns 400 naming rejected redirect %s when the flag is on',
    async uri => {
      const response = await postRegister(
        createAuth(true),
        registrationBody([uri])
      );
      const body = await readJson(response);
      expect(response.status).toBe(400);
      expect(body.error).toBe('invalid_client_metadata');
      expect(body.error_description).toBe(
        `redirect_uri ${JSON.stringify(uri)} is not allowed. Allowed clients: ${FAMILIES}.`
      );
    }
  );

  it('still names a rejected redirect when the flag is off', async () => {
    const uri = REJECTED[0];
    const response = await postRegister(
      createAuth(false),
      registrationBody([uri])
    );
    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body.error_description).toContain(uri);
    expect(body.error_description).toContain(FAMILIES);
  });
});
