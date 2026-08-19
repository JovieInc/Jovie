import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { authorizeSummerControl } from '@/lib/ovie/control';

export const OVIE_MCP_RESOURCE_PATH = '/api/ovie/mcp';
export const OVIE_OAUTH_ISSUER_PATH = '/api/ovie/oauth';

export type OvieOAuthClient = {
  readonly client_id: string;
  readonly client_secret?: string;
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

type PendingCode = {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly subject: string;
  readonly email?: string;
  readonly isAdmin: boolean;
  readonly scopes: readonly string[];
  readonly exp: number;
};

export class OvieOAuthIssuer {
  private readonly clients = new Map<string, OvieOAuthClient>();
  private readonly codes = new Map<string, PendingCode>();

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
    const client: OvieOAuthClient = {
      client_id: `ovie_${randomBytes(8).toString('hex')}`,
      redirect_uris: uris,
    };
    this.clients.set(client.client_id, client);
    return client;
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
    const client = this.clients.get(input.clientId);
    if (!client || !client.redirect_uris.includes(input.redirectUri)) {
      throw new Error('invalid client or redirect_uri');
    }
    const gate = authorizeSummerControl({
      authenticated: true,
      isAdmin: input.isAdmin,
    });
    if (!gate.ok) throw new Error('founder authorization required');
    const code = randomBytes(16).toString('hex');
    this.codes.set(code, {
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      subject: input.subject,
      email: input.email,
      isAdmin: input.isAdmin,
      scopes: input.scopes ?? ['ovie:read', 'ovie:write'],
      exp: Date.now() + 5 * 60 * 1000,
    });
    return code;
  }

  exchangeToken(input: {
    clientId: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): OvieIssuedToken {
    const pending = this.codes.get(input.code);
    this.codes.delete(input.code);
    if (!pending || pending.exp < Date.now()) throw new Error('invalid code');
    if (pending.clientId !== input.clientId) throw new Error('invalid client');
    if (pending.redirectUri !== input.redirectUri) {
      throw new Error('invalid redirect_uri');
    }
    if (pkceS256(input.codeVerifier) !== pending.codeChallenge) {
      throw new Error('invalid code_verifier');
    }
    const exp = Math.floor(Date.now() / 1000) + 15 * 60;
    const claims: OvieAccessClaims = {
      sub: pending.subject,
      email: pending.email,
      isAdmin: pending.isAdmin,
      scopes: pending.scopes,
      exp,
    };
    return {
      access_token: signClaims(this.secret, claims),
      token_type: 'Bearer',
      expires_in: 15 * 60,
      scope: pending.scopes.join(' '),
    };
  }

  verifyAccessToken(token: string): OvieAccessClaims | null {
    return verifyClaims(this.secret, token);
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

function signClaims(secret: string, claims: OvieAccessClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyClaims(secret: string, token: string): OvieAccessClaims | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as OvieAccessClaims;
    if (claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

const issuers = new Map<string, OvieOAuthIssuer>();

export function getOvieOAuthIssuer(secret: string): OvieOAuthIssuer {
  let issuer = issuers.get(secret);
  if (!issuer) {
    issuer = new OvieOAuthIssuer(secret);
    issuers.set(secret, issuer);
  }
  return issuer;
}

export function extractBearer(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

/** Fix PKCE: issueCode should store SHA-256 challenge, exchange uses pkceS256. */
export function challengeOf(verifier: string): string {
  return pkceS256(verifier);
}
