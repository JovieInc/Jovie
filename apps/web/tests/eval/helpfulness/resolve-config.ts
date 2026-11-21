/** Resolve Workers AI relay config for helpfulness live scoring. */
import { execFileSync } from 'node:child_process';
import { WORKERS_AI_RELAY_BASE_URL, type WorkersAiConfig } from './workers-ai';

/**
 * Gateway guard: this runner has no Gateway path. A Gateway key in the
 * environment is refused unless the operator explicitly opted in, so a
 * future edit cannot silently start spending Gateway cash.
 */
export function assertNoGatewaySpend(
  env: NodeJS.ProcessEnv,
  allowGatewaySpend: boolean
): void {
  if (allowGatewaySpend) return;
  const gatewayVars = Object.keys(env).filter(
    key => /GATEWAY.*(KEY|TOKEN)/i.test(key) && Boolean(env[key])
  );
  if (gatewayVars.length > 0) {
    throw new Error(
      `Refusing to run with AI Gateway credentials present (${gatewayVars.join(', ')}). Unset them or pass --allow-gateway-spend.`
    );
  }
}

/** wrangler OAuth tokens live about an hour; refresh well before that. */
const WRANGLER_TOKEN_TTL_MS = 20 * 60_000;

/**
 * Prefer the production Workers AI relay when `WORKERS_AI_TOKEN` is set so
 * Cursor agent VMs and CI can score without `CLOUDFLARE_ACCOUNT_ID`. Fall
 * back to the direct Cloudflare API for local Doppler / wrangler hosts.
 */
export function resolveWorkersAiConfig(
  env: NodeJS.ProcessEnv = process.env
): WorkersAiConfig {
  const relayToken = env.WORKERS_AI_TOKEN?.trim() ?? '';
  if (relayToken) {
    const baseUrl = (
      env.WORKERS_AI_BASE_URL?.trim() || WORKERS_AI_RELAY_BASE_URL
    ).replace(/\/+$/u, '');
    return { mode: 'relay', baseUrl, token: () => relayToken };
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new Error(
      'Set WORKERS_AI_TOKEN (relay) or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (direct Workers AI).'
    );
  }
  const fixed = env.CLOUDFLARE_API_TOKEN?.trim() ?? '';
  if (fixed) return { mode: 'direct', accountId, token: () => fixed };
  let cached = '';
  let fetchedAt = 0;
  const token = () => {
    if (!cached || Date.now() - fetchedAt > WRANGLER_TOKEN_TTL_MS) {
      cached =
        execFileSync('npx', ['-y', 'wrangler@4', 'auth', 'token'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .trim()
          .split('\n')
          .at(-1)
          ?.trim() ?? '';
      fetchedAt = Date.now();
    }
    if (!cached) {
      throw new Error(
        'CLOUDFLARE_API_TOKEN is required (or run `wrangler login` on this host).'
      );
    }
    return cached;
  };
  token();
  return { mode: 'direct', accountId, token };
}
