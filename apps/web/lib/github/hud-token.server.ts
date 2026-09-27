import 'server-only';

import { createSign } from 'node:crypto';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

/**
 * GitHub token for Ovie/HUD reads (JOV-6932).
 *
 * Prefers a short-lived jovie-bot GitHub App installation token so HUD reads
 * have their own rate limits instead of sharing Tim's per-user GraphQL cap
 * with every agent. Falls back to the static HUD_GITHUB_TOKEN when the app
 * env is absent or minting fails.
 */
const READ_ONLY_PERMISSIONS = {
  actions: 'read',
  checks: 'read',
  contents: 'read',
  metadata: 'read',
  pull_requests: 'read',
} as const;
const REFRESH_MARGIN_MS = 5 * 60_000;

let cached: { token: string; expiresAtMs: number } | null = null;

interface BotConfig {
  readonly appId: string;
  readonly privateKey: string;
  readonly installationId: string;
}

function botConfig(): BotConfig | null {
  const appId = env.JOVIE_BOT_APP_ID?.trim();
  const installationId = env.JOVIE_BOT_INSTALLATION_ID?.trim();
  // Vercel env stores the PEM with literal \n when pasted on one line.
  const privateKey = env.JOVIE_BOT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!appId || !installationId || !privateKey) return null;
  return { appId, installationId, privateKey };
}

export function hasHudGithubAuth(): boolean {
  return Boolean(botConfig() || env.HUD_GITHUB_TOKEN);
}

export function signAppJwt(
  appId: string,
  privateKey: string,
  nowMs: number
): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const nowSeconds = Math.floor(nowMs / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
    iss: appId,
  })}`;
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKey)
    .toString('base64url');
  return `${unsigned}.${signature}`;
}

export async function resolveHudGithubToken(
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now()
): Promise<string | undefined> {
  const config = botConfig();
  if (!config) return env.HUD_GITHUB_TOKEN;
  if (cached && cached.expiresAtMs - REFRESH_MARGIN_MS > nowMs) {
    return cached.token;
  }
  try {
    const response = await fetchImpl(
      `https://api.github.com/app/installations/${config.installationId}/access_tokens`,
      {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${signAppJwt(config.appId, config.privateKey, nowMs)}`,
        },
        body: JSON.stringify({ permissions: READ_ONLY_PERMISSIONS }),
      }
    );
    if (!response.ok)
      throw new Error(`installation token HTTP ${response.status}`);
    const body = (await response.json()) as {
      token?: unknown;
      expires_at?: unknown;
    };
    const expiresAtMs = Date.parse(String(body.expires_at));
    if (typeof body.token !== 'string' || !Number.isFinite(expiresAtMs)) {
      throw new Error('installation token response malformed');
    }
    cached = { token: body.token, expiresAtMs };
    return body.token;
  } catch (error) {
    logger.warn('[hud-github] bot token mint failed; using HUD_GITHUB_TOKEN', {
      error,
    });
    return env.HUD_GITHUB_TOKEN;
  }
}

/** Test-only: forget the cached installation token. */
export function resetHudGithubTokenForTests(): void {
  cached = null;
}
