import { createVerify, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockEnv = vi.hoisted(() => ({
  HUD_GITHUB_TOKEN: 'gho_personal' as string | undefined,
  JOVIE_BOT_APP_ID: undefined as string | undefined,
  JOVIE_BOT_INSTALLATION_ID: undefined as string | undefined,
  JOVIE_BOT_PRIVATE_KEY: undefined as string | undefined,
}));
vi.mock('@/lib/env-server', () => ({ env: mockEnv }));

import {
  hasHudGithubAuth,
  resetHudGithubTokenForTests,
  resolveHudGithubToken,
  signAppJwt,
} from '@/lib/github/hud-token.server';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const NOW = Date.parse('2026-09-27T22:00:00Z');

function configureBot() {
  mockEnv.JOVIE_BOT_APP_ID = '2934433';
  mockEnv.JOVIE_BOT_INSTALLATION_ID = '112037986';
  // Vercel one-line paste keeps literal \n.
  mockEnv.JOVIE_BOT_PRIVATE_KEY = PEM.replace(/\n/g, '\\n');
}

afterEach(() => {
  mockEnv.JOVIE_BOT_APP_ID = undefined;
  mockEnv.JOVIE_BOT_INSTALLATION_ID = undefined;
  mockEnv.JOVIE_BOT_PRIVATE_KEY = undefined;
  resetHudGithubTokenForTests();
});

describe('resolveHudGithubToken', () => {
  it('falls back to HUD_GITHUB_TOKEN when the bot app is not configured', async () => {
    const fetchImpl = vi.fn();
    await expect(resolveHudGithubToken(fetchImpl, NOW)).resolves.toBe(
      'gho_personal'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(hasHudGithubAuth()).toBe(true);
  });

  it('mints a read-only installation token once and reuses it until near expiry', async () => {
    configureBot();
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            token: 'ghs_bot',
            expires_at: new Date(NOW + 60 * 60_000).toISOString(),
          }),
          { status: 201 }
        )
    );
    await expect(resolveHudGithubToken(fetchImpl, NOW)).resolves.toBe(
      'ghs_bot'
    );
    await expect(
      resolveHudGithubToken(fetchImpl, NOW + 30 * 60_000)
    ).resolves.toBe('ghs_bot');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://api.github.com/app/installations/112037986/access_tokens'
    );
    expect(JSON.parse(String(init.body)).permissions).toEqual({
      actions: 'read',
      checks: 'read',
      contents: 'read',
      issues: 'read',
      metadata: 'read',
      pull_requests: 'read',
    });
    // Near expiry it refreshes.
    await resolveHudGithubToken(fetchImpl, NOW + 57 * 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to HUD_GITHUB_TOKEN when minting fails', async () => {
    configureBot();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(resolveHudGithubToken(fetchImpl, NOW)).resolves.toBe(
      'gho_personal'
    );
  });
});

describe('signAppJwt', () => {
  it('signs an RS256 app JWT the public key verifies', () => {
    const jwt = signAppJwt('2934433', PEM, NOW);
    const [header, payload, signature] = jwt.split('.');
    const verified = createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature ?? '', 'base64url'));
    expect(verified).toBe(true);
    const claims = JSON.parse(
      Buffer.from(payload ?? '', 'base64url').toString()
    );
    expect(claims).toMatchObject({ iss: '2934433' });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });
});
