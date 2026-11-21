import { describe, expect, it, vi } from 'vitest';
import {
  createCanaryClaimWalk,
  shouldInjectCanaryClaimWalk,
} from './cert-claim-walk';

const DRAFT = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const HANDOFF = 'a'.repeat(43);
const CLAIM_URL = `https://jov.ie/claim/agent/${DRAFT}?h=${HANDOFF}`;
const ENV = {
  CRON_SECRET: 'cron-secret-at-least-16',
  SYNTHETIC_PASSAGE_KEY: Buffer.from('passage-key-32-bytes-exactly!!').toString(
    'base64url'
  ),
  DATABASE_URL: 'postgres://example',
};

describe('shouldInjectCanaryClaimWalk', () => {
  it('injects only when secrets are present and walk is omitted', () => {
    expect(shouldInjectCanaryClaimWalk(ENV, undefined)).toBe(true);
    expect(shouldInjectCanaryClaimWalk({}, undefined)).toBe(false);
    expect(
      shouldInjectCanaryClaimWalk(ENV, async () => ({
        claimPersisted: true,
        fixturesCleaned: true,
      }))
    ).toBe(false);
  });
});

describe('createCanaryClaimWalk', () => {
  it('resets, signs in, claims, and cleans up when deps succeed', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push(`${method} ${new URL(url).pathname}`);
        if (url.includes('/api/internal/canary/reset'))
          return new Response('{}', { status: 200 });
        if (url.includes('send-verification-otp'))
          return new Response('{}', { status: 200 });
        if (url.includes('sign-in/email-otp'))
          return new Response('{}', {
            status: 200,
            headers: {
              'set-cookie': 'better-auth.session_token=sess; Path=/; HttpOnly',
            },
          });
        if (url.includes('get-session'))
          return new Response(JSON.stringify({ user: { id: 'user-canary' } }), {
            status: 200,
          });
        return new Response('not found', { status: 404 });
      }
    ) as unknown as typeof fetch;

    const walk = createCanaryClaimWalk({
      env: ENV,
      fetchImpl,
      waitForOtp: async () => '424242',
      claimDraft: async ({ userId, draftId }) => {
        expect(userId).toBe('user-canary');
        expect(draftId).toBe(DRAFT);
        return { status: 'claimed', handle: 'jovie-prodcert-claim' };
      },
      nowMs: () => 1_700_000_000_000,
    });

    const result = await walk({
      origin: 'https://jov.ie',
      run: 'cert-test',
      draftId: DRAFT,
      claimUrl: CLAIM_URL,
    });

    expect(result.claimPersisted).toBe(true);
    expect(result.fixturesCleaned).toBe(true);
    expect(calls.filter(c => c.includes('canary/reset'))).toHaveLength(2);
    expect(calls.some(c => c.includes('sign-in/email-otp'))).toBe(true);
  });

  it('still attempts cleanup reset when claim fails', async () => {
    let resets = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/internal/canary/reset')) {
        resets += 1;
        return new Response('{}', { status: 200 });
      }
      if (url.includes('send-verification-otp'))
        return new Response('{}', { status: 200 });
      if (url.includes('sign-in/email-otp'))
        return new Response('{}', {
          status: 200,
          headers: {
            'set-cookie': 'better-auth.session_token=sess; Path=/',
          },
        });
      if (url.includes('get-session'))
        return new Response(JSON.stringify({ user: { id: 'user-canary' } }), {
          status: 200,
        });
      return new Response('no', { status: 404 });
    }) as unknown as typeof fetch;

    const walk = createCanaryClaimWalk({
      env: ENV,
      fetchImpl,
      waitForOtp: async () => '424242',
      claimDraft: async () => {
        throw new Error('claim blew up');
      },
    });

    await expect(
      walk({
        origin: 'https://jov.ie',
        run: 'cert-test',
        draftId: DRAFT,
        claimUrl: CLAIM_URL,
      })
    ).rejects.toThrow('claim blew up');
    expect(resets).toBe(2);
  });
});
