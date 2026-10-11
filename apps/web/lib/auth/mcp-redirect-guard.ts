import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import {
  acceptedMcpRedirectUris,
  isAllowedMcpRedirectUri,
  mcpRedirectRejection,
} from '@/lib/oauth/mcp-redirect-allowlist';
import { isOAuthProviderTrustedClient } from './oauth-trusted-clients';

const REGISTRATION_PATHS = new Set([
  '/oauth2/register',
  '/oauth2/create-client',
  // Better Auth oauth-provider admin endpoints mounted under /api/auth.
  // They are not Jovie app routes, and constants/routes is partially mocked.
  // eslint-disable-next-line @jovie/no-hardcoded-routes -- provider path, not an app route
  '/admin/oauth2/create-client',
  '/oauth2/update-client',
  // eslint-disable-next-line @jovie/no-hardcoded-routes -- provider path, not an app route
  '/admin/oauth2/update-client',
]);

type GuardContext = {
  body?: unknown;
  query?: unknown;
  request?: Request;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readField(source: unknown, name: string): unknown {
  return isRecord(source) ? source[name] : undefined;
}

function registrationRedirects(body: unknown): unknown {
  const update = readField(body, 'update');
  if (update !== undefined) {
    return (
      readField(update, 'redirect_uris') ?? readField(update, 'redirectUris')
    );
  }
  return readField(body, 'redirect_uris') ?? readField(body, 'redirectUris');
}

function registrationClientId(body: unknown): unknown {
  return readField(body, 'client_id') ?? readField(body, 'clientId');
}

function queryField(context: GuardContext, name: string): unknown {
  const fromQuery = readField(context.query, name);
  if (typeof fromQuery === 'string') return fromQuery;
  const fromBody = readField(context.body, name);
  if (typeof fromBody === 'string') return fromBody;
  const url = context.request?.url;
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function invalidMetadata(error: unknown): never {
  const errorDescription =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'invalid client metadata';
  throw new APIError('BAD_REQUEST', {
    error: 'invalid_client_metadata',
    error_description: errorDescription,
  });
}

/**
 * Applies the shared MCP redirect allowlist to Better Auth client
 * registration and authorize/token redirect checks. Cached LogYourBody
 * clients keep their registered redirects.
 */
export function mcpOAuthRedirectGuard(): BetterAuthPlugin {
  return {
    id: 'jovie-mcp-redirect-guard',
    hooks: {
      before: [
        {
          matcher: context => REGISTRATION_PATHS.has(context.path ?? ''),
          handler: createAuthMiddleware(async context => {
            const body = (context as GuardContext).body;
            const clientId = registrationClientId(body);
            if (
              typeof clientId === 'string' &&
              isOAuthProviderTrustedClient(clientId)
            ) {
              return;
            }
            const redirects = registrationRedirects(body);
            if (redirects === undefined && context.path?.includes('update')) {
              return;
            }
            try {
              acceptedMcpRedirectUris(redirects);
            } catch (error) {
              invalidMetadata(error);
            }
          }),
        },
        {
          matcher: context =>
            context.path === '/oauth2/authorize' ||
            context.path === '/oauth2/token',
          handler: createAuthMiddleware(async context => {
            const guard = context as GuardContext;
            const clientId = queryField(guard, 'client_id');
            if (
              typeof clientId === 'string' &&
              isOAuthProviderTrustedClient(clientId)
            ) {
              return;
            }
            const redirectUri = queryField(guard, 'redirect_uri');
            if (typeof redirectUri !== 'string' || redirectUri.length === 0) {
              return;
            }
            if (!isAllowedMcpRedirectUri(redirectUri)) {
              invalidMetadata(mcpRedirectRejection(redirectUri));
            }
          }),
        },
      ],
    },
  };
}
