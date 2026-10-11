import { expect, test, vi } from 'vitest';
import {
  type DesktopAuthHandbackFetch,
  normalizeDesktopReturnCode,
  redeemDesktopReturnCode,
} from '../src/desktop-auth-handback.ts';
import {
  DESKTOP_AUTH_PKCE_TTL_MS,
  type PendingDesktopAuthPkce,
} from '../src/desktop-auth-security.ts';

const VALID_CODE = '00000000000040008000000000000001';
const VALID_STATE = '11111111111141111111111111111111';
const ENDPOINT = 'https://jov.ie/api/auth/native/handback';

function pkce(overrides: Partial<PendingDesktopAuthPkce> = {}) {
  return {
    codeVerifier: 'v'.repeat(86),
    codeChallenge: 'challenge',
    flowNonce: 'desktop_flow_nonce_12345',
    createdAt: 1_000,
    ...overrides,
  } satisfies PendingDesktopAuthPkce;
}

function respond(status: number, body: unknown) {
  return { status, json: async () => body };
}

function redeem(
  fetch: DesktopAuthHandbackFetch,
  overrides: {
    pending?: PendingDesktopAuthPkce | null;
    returnCode?: unknown;
    now?: number;
  } = {}
) {
  return redeemDesktopReturnCode({
    endpoint: ENDPOINT,
    fetch,
    pending: overrides.pending === undefined ? pkce() : overrides.pending,
    returnCode: overrides.returnCode ?? 'bcdf-ghjk',
    now: overrides.now ?? 2_000,
  });
}

test('normalizes typed codes and rejects anything outside the alphabet', () => {
  expect(normalizeDesktopReturnCode('bcdf-ghjk')).toBe('BCDFGHJK');
  expect(normalizeDesktopReturnCode(' BCDF GHJK ')).toBe('BCDFGHJK');
  expect(normalizeDesktopReturnCode('BCDFGHJ0')).toBeNull();
  expect(normalizeDesktopReturnCode('AEIOUAEI')).toBeNull();
  expect(normalizeDesktopReturnCode('BCDF')).toBeNull();
  expect(normalizeDesktopReturnCode('B'.repeat(40))).toBeNull();
  expect(normalizeDesktopReturnCode(42)).toBeNull();
});

test('redeems the code with the pending flow nonce and PKCE verifier', async () => {
  const fetch = vi
    .fn<DesktopAuthHandbackFetch>()
    .mockResolvedValue(
      respond(200, { status: 'complete', code: VALID_CODE, state: VALID_STATE })
    );

  await expect(redeem(fetch)).resolves.toEqual({
    ok: true,
    completion: {
      code: VALID_CODE,
      state: VALID_STATE,
      flowNonce: 'desktop_flow_nonce_12345',
    },
  });
  expect(fetch).toHaveBeenCalledWith(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client: 'electron',
      desktopFlow: 'desktop_flow_nonce_12345',
      codeVerifier: 'v'.repeat(86),
      returnCode: 'BCDFGHJK',
    }),
  });
});

test('fails locally without a network call for bad input or a dead flow', async () => {
  const fetch = vi.fn<DesktopAuthHandbackFetch>();
  await expect(redeem(fetch, { returnCode: 'nope' })).resolves.toEqual({
    ok: false,
    reason: 'invalid-code',
  });
  await expect(redeem(fetch, { pending: null })).resolves.toEqual({
    ok: false,
    reason: 'no-pending-flow',
  });
  await expect(
    redeem(fetch, { now: 1_000 + DESKTOP_AUTH_PKCE_TTL_MS + 1 })
  ).resolves.toEqual({ ok: false, reason: 'pkce-expired' });
  expect(fetch).not.toHaveBeenCalled();
});

test('maps server and network failures to retryable reasons', async () => {
  const cases: Array<[() => Promise<unknown>, string]> = [
    [async () => respond(401, { status: 'invalid' }), 'invalid-code'],
    [async () => respond(400, {}), 'invalid-code'],
    [async () => respond(429, {}), 'rate-limited'],
    [async () => respond(503, {}), 'network'],
    [
      async () => {
        throw new Error('ENOTFOUND');
      },
      'network',
    ],
  ];
  for (const [impl, reason] of cases) {
    const fetch = vi
      .fn<DesktopAuthHandbackFetch>()
      .mockImplementation(impl as never);
    await expect(redeem(fetch)).resolves.toEqual({ ok: false, reason });
  }
});

test('never trusts a malformed completion from the server', async () => {
  const fetch = vi.fn<DesktopAuthHandbackFetch>().mockResolvedValue(
    respond(200, {
      status: 'complete',
      code: 'javascript:alert(1)',
      state: VALID_STATE,
    })
  );
  await expect(redeem(fetch)).resolves.toEqual({
    ok: false,
    reason: 'network',
  });
});
