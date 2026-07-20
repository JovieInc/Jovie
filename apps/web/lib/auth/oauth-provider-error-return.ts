import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getOAuthState } from 'better-auth/api';

const HANDOFF_STATE_KEY = 'jovieOAuthProviderReturn';
const HANDOFF_STATE_VERSION = 1;
const PKCE_S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const SIGNED_QUERY_INTERNAL_KEYS = [
  'sig',
  'exp',
  'ba_iat',
  'ba_pl',
  'ba_param',
] as const;

type OAuthClientRecord = {
  clientId?: unknown;
  disabled?: unknown;
  grantTypes?: unknown;
  responseTypes?: unknown;
  redirectUris?: unknown;
};

type HandoffState = {
  version: number;
  expiresAt: number;
  issuer: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSingleParam(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  if (values.length !== 1 || !values[0]) return null;
  return values[0];
}

function normalizeIssuer(baseURL: string): string | null {
  try {
    const issuer = new URL(baseURL);
    issuer.search = '';
    issuer.hash = '';
    return issuer.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function sanitizeSignedAuthorizationQuery(
  oauthQuery: string
): { query: string; expiresAt: number } | null {
  const params = new URLSearchParams(oauthQuery);
  const expiresAtSeconds = Number(getSingleParam(params, 'exp'));
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) {
    return null;
  }

  for (const key of SIGNED_QUERY_INTERNAL_KEYS) params.delete(key);
  return {
    query: params.toString(),
    expiresAt: expiresAtSeconds * 1000,
  };
}

function parseHandoffState(value: unknown): HandoffState | null {
  if (!isRecord(value)) return null;
  if (value.version !== HANDOFF_STATE_VERSION) return null;
  if (
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= Date.now()
  ) {
    return null;
  }
  if (typeof value.issuer !== 'string' || !normalizeIssuer(value.issuer)) {
    return null;
  }
  return value as HandoffState;
}

function hasStringArrayValue(value: unknown, expected: string): boolean {
  return (
    Array.isArray(value) &&
    value.some(item => typeof item === 'string' && item === expected)
  );
}

function isValidAuthorizationClient(
  client: OAuthClientRecord | null,
  clientId: string,
  redirectURI: string
): boolean {
  if (!client || client.clientId !== clientId || client.disabled === true) {
    return false;
  }

  const grantTypes = client.grantTypes ?? ['authorization_code'];
  const responseTypes = client.responseTypes ?? ['code'];
  return (
    hasStringArrayValue(grantTypes, 'authorization_code') &&
    hasStringArrayValue(responseTypes, 'code') &&
    hasStringArrayValue(client.redirectUris, redirectURI)
  );
}

function getSameOriginError(location: string, baseURL: string): string | null {
  try {
    const actual = new URL(location, baseURL);
    const expected = new URL(`${baseURL.replace(/\/$/, '')}/error`);
    if (
      actual.origin !== expected.origin ||
      actual.pathname !== expected.pathname
    ) {
      return null;
    }
    return getSingleParam(actual.searchParams, 'error');
  } catch {
    return null;
  }
}

/**
 * Completes OAuth-provider failures back to a validated native/client redirect.
 *
 * The OAuth Provider plugin must be immediately before this plugin. Its before
 * hook verifies `oauth_query`; this hook then replaces any caller-controlled
 * copy with the sanitized query before Better Auth signs its own provider
 * state. The callback after-hook only rewrites Better Auth's same-origin error
 * redirect after that inner state has been validated and consumed.
 */
export function oauthProviderErrorReturn(): BetterAuthPlugin {
  return {
    id: 'jovie-oauth-provider-error-return',
    hooks: {
      before: [
        {
          matcher: context =>
            (context.path === '/sign-in/social' ||
              context.path === '/sign-in/oauth2') &&
            typeof context.body?.oauth_query === 'string',
          handler: createAuthMiddleware(async context => {
            const oauthQuery = context.body?.oauth_query;
            if (typeof oauthQuery !== 'string') return;

            const sanitized = sanitizeSignedAuthorizationQuery(oauthQuery);
            const issuer = normalizeIssuer(context.context.baseURL);
            if (!sanitized || !issuer) {
              delete context.body.errorCallbackURL;
              throw new APIError('BAD_REQUEST', {
                message: 'Invalid OAuth authorization query.',
              });
            }

            const existingAdditionalData = isRecord(context.body.additionalData)
              ? context.body.additionalData
              : {};

            // Never turn the outer client's redirect URI into Better Auth's
            // errorCallbackURL. The after-hook performs the validated handoff.
            delete context.body.errorCallbackURL;
            context.body.additionalData = {
              ...existingAdditionalData,
              query: sanitized.query,
              [HANDOFF_STATE_KEY]: {
                version: HANDOFF_STATE_VERSION,
                expiresAt: sanitized.expiresAt,
                issuer,
              } satisfies HandoffState,
            };
            return { context: { body: context.body } };
          }),
        },
      ],
      after: [
        {
          matcher: context => context.path === '/callback/:id',
          handler: createAuthMiddleware(async context => {
            const location = context.context.responseHeaders?.get('location');
            if (!location) return;

            const providerError = getSameOriginError(
              location,
              context.context.baseURL
            );
            if (!providerError) return;

            const state = await getOAuthState();
            const handoff = parseHandoffState(state?.[HANDOFF_STATE_KEY]);
            if (!handoff || typeof state?.query !== 'string') return;

            const query = new URLSearchParams(state.query);
            const clientId = getSingleParam(query, 'client_id');
            const redirectURI = getSingleParam(query, 'redirect_uri');
            const responseType = getSingleParam(query, 'response_type');
            const codeChallenge = getSingleParam(query, 'code_challenge');
            const codeChallengeMethod = getSingleParam(
              query,
              'code_challenge_method'
            );
            const outerState = getSingleParam(query, 'state');

            if (
              !clientId ||
              !redirectURI ||
              responseType !== 'code' ||
              !codeChallenge ||
              !PKCE_S256_CHALLENGE.test(codeChallenge) ||
              codeChallengeMethod !== 'S256' ||
              !outerState
            ) {
              return;
            }

            const client =
              await context.context.adapter.findOne<OAuthClientRecord>({
                model: 'oauthClient',
                where: [{ field: 'clientId', value: clientId }],
              });
            if (!isValidAuthorizationClient(client, clientId, redirectURI)) {
              return;
            }

            let redirect: URL;
            try {
              redirect = new URL(redirectURI);
            } catch {
              return;
            }
            redirect.searchParams.set(
              'error',
              providerError === 'access_denied'
                ? 'access_denied'
                : 'server_error'
            );
            redirect.searchParams.set('state', outerState);
            redirect.searchParams.set('iss', handoff.issuer);
            redirect.searchParams.delete('error_description');

            // `setHeader` replaces only Location. Better Auth's state-cookie
            // cleanup Set-Cookie header stays on the response.
            context.setHeader('location', redirect.toString());
          }),
        },
      ],
    },
  };
}
