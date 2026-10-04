import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as invoke } from '@/app/api/v1/actions/[actionId]/invoke/route';
import { POST as control } from '@/app/api/v1/fleet/[operation]/route';
import type { RateLimitResult } from '@/lib/rate-limit';
import { limitFleetRequest } from './rate-limit';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  runtime: vi.fn(() => ({})),
  handler: vi.fn(async () => new Response('allowed')),
}));
vi.mock('@/lib/rate-limit', async () => ({
  ...(await import('@/lib/rate-limit/utils')),
  generalLimiter: { limit: mocks.limit },
}));
vi.mock('./runtime', () => ({ fleetRuntime: mocks.runtime }));
vi.mock('./http', () => ({
  handleFleetInvocation: mocks.handler,
  handleFleetControl: mocks.handler,
}));

const result: RateLimitResult = {
  success: false,
  limit: 60,
  remaining: 0,
  reset: new Date(Date.now() + 60_000),
};
function request(path = 'fleet.register', profileId = 'first') {
  return new Request(`https://jov.ie/api/v1/actions/${path}/invoke`, {
    method: 'POST',
    headers: {
      'x-vercel-forwarded-for': '192.0.2.1',
      'x-forwarded-for': profileId,
      authorization: `Bearer ${profileId}`,
    },
    body: JSON.stringify({ context: { profileId } }),
  });
}
const params = Promise.resolve({
  actionId: 'fleet.register',
  operation: 'approve',
});
describe('fleet ingress budget', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    [429, 'RATE_LIMITED', false],
    [503, 'TEMPORARILY_UNAVAILABLE', true],
    [503, 'TEMPORARILY_UNAVAILABLE', 'throw'],
  ] as const)(
    'returns %s before runtime or body access',
    async (status, code, failure) => {
      if (failure === 'throw')
        mocks.limit.mockRejectedValue(new Error('store down'));
      else mocks.limit.mockResolvedValue({ ...result, unavailable: failure });
      for (const post of [invoke, control]) {
        const req = request();
        const response = await post(req, { params });
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({
          error: { code, retryable: true },
        });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(req.bodyUsed).toBe(false);
      }
      expect(mocks.runtime).not.toHaveBeenCalled();
      expect(mocks.handler).not.toHaveBeenCalled();
    }
  );
  it('shares one trusted IP budget across attacker-selected identities and actions', async () => {
    mocks.limit.mockResolvedValue(result);
    await limitFleetRequest(request('fleet.register', 'first'));
    await limitFleetRequest(request('work.next', 'second'));
    expect(mocks.limit.mock.calls).toEqual([
      ['fleet:192.0.2.1'],
      ['fleet:192.0.2.1'],
    ]);
  });
  it('continues both routes when the durable budget allows them', async () => {
    mocks.limit.mockResolvedValue({ ...result, success: true });
    for (const post of [invoke, control])
      expect(await (await post(request(), { params })).text()).toBe('allowed');
    expect(mocks.runtime).toHaveBeenCalledTimes(2);
    expect(mocks.handler).toHaveBeenCalledTimes(2);
  });
});
