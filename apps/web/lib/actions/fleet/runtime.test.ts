import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedAuth } from '@/lib/auth/cached';
import { handleFleetControl } from './http';
import { fleetRuntime } from './runtime';
import type { FleetSummerEvent } from './summer';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(async () => true),
  owned: vi.fn(async () => 'founder'),
  get: vi.fn(async () => null),
  write: vi.fn(async () => true),
  after: vi.fn<(task: () => Promise<void>) => void>(),
  sendWake: vi.fn<(profileId: string, eventId: string) => Promise<void>>(),
  captureError: vi.fn(async () => undefined),
}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('./summer-transport', () => ({ sendSummerFleetWake: mocks.sendWake }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({ cookie: 'better-auth.session_data=stale' }),
}));
vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock('@/lib/auth/app-user', () => ({
  getAppUserByBetterAuthId: async () => ({
    id: 'founder',
    userStatus: 'active',
    deletedAt: null,
  }),
}));
vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: async () => null,
}));
vi.mock('@/lib/sentry/set-user-context', () => ({
  attachSentryContext: vi.fn(),
}));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: mocks.admin }));
vi.mock('@/lib/auth/session', () => ({ withDbSessionTx: mocks.owned }));
vi.mock('@/lib/env-server', () => ({ env: { JOVIE_FLEET_ENABLED: '1' } }));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({
    get: mocks.get,
    setIfAbsent: mocks.write,
    compareAndSet: mocks.write,
  }),
}));

describe('fleet founder session revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockImplementation(
      async (input: { query?: { disableCookieCache?: boolean } }) =>
        input.query?.disableCookieCache
          ? null
          : {
              session: { id: 'revoked-session' },
              user: { id: 'founder-ba' },
            }
    );
  });
  it.each(['approve', 'execute'] as const)(
    'rejects %s with a valid cookie cache but revoked database session',
    async kind => {
      expect(await getCachedAuth()).toMatchObject({ userId: 'founder' });
      const request = new Request('https://jov.ie/api/v1/fleet/' + kind, {
        method: 'POST',
        headers: { origin: 'https://jov.ie' },
        body: JSON.stringify({
          profileId: '11111111-1111-4111-a111-111111111111',
          operation: 'provision',
          approvalId: '22222222-2222-4222-a222-222222222222',
          input: {
            workerId: 'aeon',
            scopes: ['fleet:register'],
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }),
      });
      const response = await handleFleetControl(request, kind, fleetRuntime());
      expect(response.status).toBe(403);
      expect(mocks.session).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { disableCookieCache: true } })
      );
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.owned).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );
});

describe('deferred Summer fleet wake delivery', () => {
  const profileId = '11111111-1111-4111-a111-111111111111';
  const otherProfileId = '22222222-2222-4222-a222-222222222222';
  const event = (eventId: string): FleetSummerEvent => ({
    eventId,
    requestId: `request-${eventId}`,
    delegationId: 'delegation',
    requestHash: 'a'.repeat(64),
    state: 'pending',
    createdAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2026-10-02T00:00:00.000Z',
  });
  const runDeferred = (index = 0) => {
    const task = mocks.after.mock.calls[index]?.[0];
    if (!task) throw new Error('Expected a deferred wake callback');
    return task();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendWake.mockReset().mockResolvedValue(undefined);
    mocks.captureError.mockReset().mockResolvedValue(undefined);
  });

  it('waits for the response before reading and sending each profile’s pending event IDs', async () => {
    const runtime = fleetRuntime();
    const pending = vi
      .spyOn(runtime.dispatcher, 'pendingSummerEvents')
      .mockImplementation(async id =>
        id === profileId
          ? [event('first-event'), event('second-event')]
          : [event('other-profile-event')]
      );

    runtime.scheduleSummerWake?.(profileId);
    runtime.scheduleSummerWake?.(otherProfileId);
    expect(mocks.after).toHaveBeenCalledTimes(2);
    expect(pending).not.toHaveBeenCalled();
    expect(mocks.sendWake).not.toHaveBeenCalled();

    // Run the second response first to catch a shared mutable profile binding.
    await runDeferred(1);
    expect(pending).toHaveBeenCalledExactlyOnceWith(otherProfileId);
    expect(mocks.sendWake.mock.calls).toEqual([
      [otherProfileId, 'other-profile-event'],
    ]);
    await runDeferred(0);
    expect(pending.mock.calls).toEqual([[otherProfileId], [profileId]]);
    expect(mocks.sendWake.mock.calls).toEqual([
      [otherProfileId, 'other-profile-event'],
      [profileId, 'first-event'],
      [profileId, 'second-event'],
    ]);
    expect(mocks.captureError).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('attempts every pending event and captures a rejected delivery after the others settle', async () => {
    const runtime = fleetRuntime();
    vi.spyOn(runtime.dispatcher, 'pendingSummerEvents').mockResolvedValue([
      event('failed-event'),
      event('delayed-event'),
      event('last-event'),
    ]);
    const failure = new Error('Summer unavailable');
    let finishDelivery!: () => void;
    const delayed = new Promise<void>(resolve => {
      finishDelivery = resolve;
    });
    mocks.sendWake.mockRejectedValueOnce(failure).mockReturnValueOnce(delayed);
    runtime.scheduleSummerWake?.(profileId);
    const completion = runDeferred();
    await Promise.resolve();

    expect(mocks.sendWake.mock.calls).toEqual([
      [profileId, 'failed-event'],
      [profileId, 'delayed-event'],
      [profileId, 'last-event'],
    ]);
    expect(mocks.captureError).not.toHaveBeenCalled();
    finishDelivery();
    await expect(completion).resolves.toBeUndefined();
    expect(mocks.captureError).toHaveBeenCalledExactlyOnceWith(
      'Summer fleet wake failed; durable event remains pending',
      failure,
      { route: '/api/v1/actions/[actionId]/invoke' }
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('captures a failed pending-event read without sending or changing durable state', async () => {
    const runtime = fleetRuntime();
    const failure = new Error('Fleet backend unavailable');
    const pending = vi
      .spyOn(runtime.dispatcher, 'pendingSummerEvents')
      .mockRejectedValue(failure);
    runtime.scheduleSummerWake?.(profileId);

    await expect(runDeferred()).resolves.toBeUndefined();
    expect(pending).toHaveBeenCalledExactlyOnceWith(profileId);
    expect(mocks.sendWake).not.toHaveBeenCalled();
    expect(mocks.captureError).toHaveBeenCalledExactlyOnceWith(
      'Summer fleet wake failed; durable event remains pending',
      failure,
      { route: '/api/v1/actions/[actionId]/invoke' }
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
