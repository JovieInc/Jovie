import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  list: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: mocks.verify,
}));
vi.mock('@/lib/analytics/signup-replay.server', () => ({
  listStuckSignupReplays: mocks.list,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));

import { GET } from './route';

const get = (qs = '') =>
  GET(
    new Request(
      `https://jov.ie/api/internal/ovie/summer-company/stuck-signups${qs}`
    )
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue(true);
  mocks.list.mockResolvedValue([]);
});

it('rejects callers that are not Summer before reading anything', async () => {
  mocks.verify.mockResolvedValue(false);
  expect((await get()).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});

it('returns stuck signups with replay links and clamps the lookback period', async () => {
  mocks.list.mockResolvedValue([
    { userId: 'u1', signedUpAt: 'x', profileClaimed: false, replays: [] },
  ]);
  const res = await get('?days=500');
  expect(res.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith(90);
  const body = await res.json();
  expect(body.contract).toBe('summer-stuck-signups/v1');
  expect(body.signups).toHaveLength(1);
});

it('reports unavailable when the read fails', async () => {
  mocks.list.mockRejectedValue(new Error('db'));
  expect((await get()).status).toBe(503);
  expect(mocks.capture).toHaveBeenCalled();
});
