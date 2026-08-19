import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { authorizeSummerControl } from '@/lib/ovie/control';

export const OVIE_MCP_RESOURCE_PATH = '/api/ovie/mcp';
export const OVIE_OAUTH_ISSUER_PATH = '/api/ovie/oauth';
export const OVIE_FALLBACK_SECRET =
  'jovie-non-production-better-auth-fallback-secret';

export function ovieIssuerSecret(): string {
  return process.env.BETTER_AUTH_SECRET || OVIE_FALLBACK_SECRET;
}

export type OvieOAuthClient = {
  readonly client_id: string;
  readonly redirect_uris: readonly string[];
};

export type OvieIssuedToken = {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly scope: string;
};

export type OvieAccessClaims = {
  readonly sub: string;
  readonly email?: string;
  readonly isAdmin: boolean;
  readonly scopes: readonly string[];
  readonly exp: number;
};

type ClientClaims = { readonly t: 'c'; readonly u: string[] };
type CodeClaims = {
  readonly t: 'a';
  readonly c: string;
  readonly r: string;
  readonly ch: string;
  readonly sub: string;
  readonly email?: string;
  readonly admin: boolean;
  readonly scopes: string[];
  readonly exp: number;
};

export class OvieOAuthIssuer {
  constructor(private readonly secret: string) {}

  metadata(origin: string) {
    const issuer = `${origin}${OVIE_OAUTH_ISSUER_PATH}`;
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['ovie:read', 'ovie:write'],
    };
  }

  protectedResourceMetadata(origin: string) {
    return {
      resource: `${origin}${OVIE_MCP_RESOURCE_PATH}`,
      authorization_servers: [`${origin}${OVIE_OAUTH_ISSUER_PATH}`],
      bearer_methods_supported: ['header'],
      scopes_supported: ['ovie:read', 'ovie:write'],
    };
  }

  registerClient(input: { redirect_uris?: unknown }): OvieOAuthClient {
    const uris = Array.isArray(input.redirect_uris)
      ? input.redirect_uris.filter(
          (uri): uri is string =>
            typeof uri === 'string' && isAllowedRedirect(uri)
        )
      : [];
    if (!uris.length) {
      throw new Error(
        'redirect_uris must include a ChatGPT or localhost HTTPS/HTTP URI'
      );
    }
    return {
      client_id: signPayload(this.secret, {
        t: 'c',
        u: uris,
      } satisfies ClientClaims),
      redirect_uris: uris,
    };
  }

  issueCode(input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    subject: string;
    email?: string;
    isAdmin: boolean;
    scopes?: readonly string[];
  }): string {
    const client = verifyPayload<ClientClaims>(this.secret, input.clientId);
    if (!client || client.t !== 'c' || !client.u.includes(input.redirectUri)) {
      throw new Error('invalid client or redirect_uri');
    }
    const gate = authorizeSummerControl({
      authenticated: true,
      isAdmin: input.isAdmin,
    });
    if (!gate.ok) throw new Error('founder authorization required');
    return signPayload(this.secret, {
      t: 'a',
      c: input.clientId,
      r: input.redirectUri,
      ch: input.codeChallenge,
      sub: input.subject,
      email: input.email,
      admin: input.isAdmin,
      scopes: [...(input.scopes ?? ['ovie:read', 'ovie:write'])],
      exp: Date.now() + 5 * 60 * 1000,
    } satisfies CodeClaims);
  }

  exchangeToken(input: {
    clientId: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): OvieIssuedToken {
    const pending = verifyPayload<CodeClaims>(this.secret, input.code);
    if (!pending || pending.t !== 'a' || pending.exp < Date.now()) {
      throw new Error('invalid code');
    }
    if (pending.c !== input.clientId) throw new Error('invalid client');
    if (pending.r !== input.redirectUri)
      throw new Error('invalid redirect_uri');
    if (pkceS256(input.codeVerifier) !== pending.ch) {
      throw new Error('invalid code_verifier');
    }
    const exp = Math.floor(Date.now() / 1000) + 15 * 60;
    const scopes = pending.scopes;
    return {
      access_token: signPayload(this.secret, {
        sub: pending.sub,
        email: pending.email,
        isAdmin: pending.admin,
        scopes,
        exp,
      } satisfies OvieAccessClaims),
      token_type: 'Bearer',
      expires_in: 15 * 60,
      scope: scopes.join(' '),
    };
  }

  verifyAccessToken(token: string): OvieAccessClaims | null {
    const claims = verifyPayload<OvieAccessClaims>(this.secret, token);
    if (
      !claims ||
      typeof claims.exp !== 'number' ||
      claims.exp * 1000 < Date.now()
    ) {
      return null;
    }
    return claims;
  }
}

export function isAllowedRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol === 'http:' && url.hostname === 'localhost') return true;
    if (url.protocol !== 'https:') return false;
    return (
      url.hostname === 'chatgpt.com' ||
      url.hostname === 'chat.openai.com' ||
      url.hostname.endsWith('.chatgpt.com')
    );
  } catch {
    return false;
  }
}

export function pkceS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function signPayload(secret: string, payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPayload<T>(secret: string, token: string): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function getOvieOAuthIssuer(
  secret = ovieIssuerSecret()
): OvieOAuthIssuer {
  return new OvieOAuthIssuer(secret);
}

export function extractBearer(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}
