import type { SessionAuthContext } from 'eve/context';
import { describe, expect, it, vi } from 'vitest';
import {
  createSummerShadowIngressHandler,
  isSummerShadowEnabled,
  renderSummerShadowObservation,
  type ShadowRecord,
  type SummerShadowEvent,
} from '../agent/lib/summer-shadow-ingress';

const NOW = new Date('2026-08-31T20:00:00.000Z');

const signedAuth: SessionAuthContext = {
  attributes: {
    dispatchAuthority: 'none',
    identity: 'summer',
    readOnly: 'true',
    source: 'ovie-summer-shadow',
  },
  authenticator: 'vercel-oidc:ovie-summer-shadow',
  issuer: 'https://oidc.vercel.com/jovie',
  principalId: 'vercel-oidc:jovie-production',
  principalType: 'service',
  subject: 'owner:jovie:project:jovie:environment:production',
};

function event(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schema: 'jovie.ovie-summer-shadow.event/v1',
    eventId: 'evt_shadow_0001',
    conversationId: 'conv_shadow_0001',
    turn: 1,
    dailySlot: 1,
    occurredAt: NOW.toISOString(),
    message: 'Observe the exact-main production release queue.',
    evidence: ['https://github.com/JovieInc/jovie/actions'],
    ...overrides,
  };
}

function request(body: unknown = event()) {
  return new Request('https://eve.example.com/ovie/v1/summer-shadow/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function dependencies(
  overrides: {
    authenticate?: () => Promise<SessionAuthContext | Response>;
    dispatch?: () => Promise<{ sessionId: string }>;
    enabled?: () => boolean;
    persistImmutable?: (
      pathname: string,
      record: ShadowRecord
    ) => Promise<'created' | 'exists'>;
  } = {}
) {
  return {
    authenticate: overrides.authenticate ?? vi.fn(async () => signedAuth),
    dispatch:
      overrides.dispatch ?? vi.fn(async () => ({ sessionId: 'ses_shadow_1' })),
    enabled: overrides.enabled ?? (() => true),
    persistImmutable:
      overrides.persistImmutable ?? vi.fn(async () => 'created' as const),
    now: () => NOW,
    deployment: () => ({
      commitSha: 'abc123',
      deploymentId: 'dpl_shadow_1',
      environment: 'preview',
      url: 'https://jovie-eve-shadow.vercel.app',
    }),
  };
}

describe('Summer shadow ingress', () => {
  it('enables only an explicit Preview deployment and fails closed elsewhere', () => {
    expect(
      isSummerShadowEnabled({
        SUMMER_SHADOW_ENABLED: 'true',
        VERCEL_ENV: 'preview',
      })
    ).toBe(true);
    expect(
      isSummerShadowEnabled({
        SUMMER_SHADOW_ENABLED: 'true',
        VERCEL_ENV: 'production',
      })
    ).toBe(false);
    expect(isSummerShadowEnabled({ VERCEL_ENV: 'preview' })).toBe(false);
  });

  it('authenticates before parsing and rejects unsigned input without side effects', async () => {
    const persistImmutable = vi.fn();
    const dispatch = vi.fn();
    const handler = createSummerShadowIngressHandler(
      dependencies({
        authenticate: vi.fn(async () =>
          Response.json({ ok: false, code: 'unauthorized' }, { status: 401 })
        ),
        persistImmutable,
        dispatch,
      })
    );

    const response = await handler(
      new Request('https://eve.example.com/ovie/v1/summer-shadow/events', {
        method: 'POST',
        body: '{not-json',
      })
    );

    expect(response.status).toBe(401);
    expect(persistImmutable).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('persists the receipt before dispatch and a terminal receipt before 202', async () => {
    const operations: string[] = [];
    const records: Array<{ pathname: string; record: ShadowRecord }> = [];
    const persistImmutable = vi.fn(
      async (pathname: string, record: ShadowRecord) => {
        operations.push(`persist:${pathname.split('/')[1]}`);
        records.push({ pathname, record });
        return 'created' as const;
      }
    );
    const dispatch = vi.fn(async () => {
      operations.push('dispatch');
      return { sessionId: 'ses_shadow_1' };
    });
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable, dispatch })
    );

    const response = await handler(request());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(operations).toEqual([
      'persist:receipts',
      'persist:budgets',
      'persist:budgets',
      'dispatch',
      'persist:terminal',
    ]);
    expect(body).toMatchObject({
      ok: true,
      eventId: 'evt_shadow_0001',
      sessionId: 'ses_shadow_1',
      authority: {
        mode: 'shadow',
        dispatchAuthority: 'none',
        allowedMutations: [],
      },
      deployment: {
        commitSha: 'abc123',
        deploymentId: 'dpl_shadow_1',
        environment: 'preview',
        url: 'https://jovie-eve-shadow.vercel.app',
      },
    });
    expect(records[0]?.record).toMatchObject({
      verdict: 'accepted_for_budget_reservation',
      source: {
        surface: 'ovie',
        source: 'ovie-summer-shadow',
        verifiedBy: 'vercel-oidc',
        subject: 'owner:jovie:project:jovie:environment:production',
      },
      outbox: {
        status: 'pending_budget_reservation',
        destination: 'eve-session',
      },
      budget: {
        maxTurnsPerSession: 5,
        maxTurnsPerUtcDay: 25,
      },
      authority: { dispatchAuthority: 'none', allowedMutations: [] },
    });
    expect(records[1]?.pathname).toMatch(
      /^summer-shadow\/budgets\/session\/[a-f0-9]{64}\/turn-1\.json$/u
    );
    expect(records[2]?.pathname).toBe(
      'summer-shadow/budgets/daily/2026-08-31/slot-1.json'
    );
    expect(records[3]?.record).toMatchObject({
      verdict: 'eve_session_accepted',
      identity: 'summer',
      source: 'ovie-summer-shadow',
      mutations: [],
      authority: { dispatchAuthority: 'none', allowedMutations: [] },
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: signedAuth,
        eventKey: expect.stringMatching(/^[a-f0-9]{64}$/u),
        conversationKey: expect.stringMatching(/^[a-f0-9]{64}$/u),
        message: expect.stringContaining('Do not call tools'),
      })
    );
  });

  it('rejects a durable replay before Eve dispatch', async () => {
    const dispatch = vi.fn();
    const persistImmutable = vi.fn(async () => 'exists' as const);
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable, dispatch })
    );

    const response = await handler(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'replay_rejected',
      eventId: 'evt_shadow_0001',
    });
    expect(persistImmutable).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON before persistence', async () => {
    const persistImmutable = vi.fn();
    const dispatch = vi.fn();
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable, dispatch })
    );

    const response = await handler(
      new Request('https://eve.example.com/ovie/v1/summer-shadow/events', {
        method: 'POST',
        body: '{not-json',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_json',
    });
    expect(persistImmutable).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fails closed behind the kill switch after auth and before parsing', async () => {
    const persistImmutable = vi.fn();
    const dispatch = vi.fn();
    const handler = createSummerShadowIngressHandler(
      dependencies({ enabled: () => false, persistImmutable, dispatch })
    );

    const response = await handler(
      new Request('https://eve.example.com/ovie/v1/summer-shadow/events', {
        method: 'POST',
        body: '{not-json',
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'shadow_disabled',
    });
    expect(persistImmutable).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'expired',
      { occurredAt: '2026-08-31T19:54:59.000Z' },
      'event_outside_freshness_window',
    ],
    [
      'future',
      { occurredAt: '2026-08-31T20:01:01.000Z' },
      'event_outside_freshness_window',
    ],
    ['malformed', { unexpected: true }, 'invalid_event'],
    ['session budget overflow', { turn: 6 }, 'invalid_event'],
    ['daily budget overflow', { dailySlot: 26 }, 'invalid_event'],
  ])('rejects %s events before persistence', async (_name, change, code) => {
    const persistImmutable = vi.fn();
    const dispatch = vi.fn();
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable, dispatch })
    );

    const response = await handler(request(event(change)));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(persistImmutable).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies before persistence', async () => {
    const persistImmutable = vi.fn();
    const dispatch = vi.fn();
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable, dispatch })
    );
    const oversized = new Request(
      'https://eve.example.com/ovie/v1/summer-shadow/events',
      {
        method: 'POST',
        body: 'x'.repeat(32 * 1024 + 1),
      }
    );

    const response = await handler(oversized);

    expect(response.status).toBe(413);
    expect(persistImmutable).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fails closed when the initial receipt cannot be persisted', async () => {
    const dispatch = vi.fn();
    const handler = createSummerShadowIngressHandler(
      dependencies({
        dispatch,
        persistImmutable: vi.fn(async () => {
          throw new Error('blob unavailable');
        }),
      })
    );

    const response = await handler(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'receipt_persistence_failed',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not acknowledge success when terminal persistence fails', async () => {
    const persistImmutable = vi
      .fn()
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('created')
      .mockRejectedValueOnce(new Error('terminal unavailable'));
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable })
    );

    const response = await handler(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'terminal_persistence_failed',
      sessionId: 'ses_shadow_1',
    });
  });

  it('preserves the durable outbox and returns 503 when Eve dispatch fails', async () => {
    const persistImmutable = vi.fn(async () => 'created' as const);
    const handler = createSummerShadowIngressHandler(
      dependencies({
        persistImmutable,
        dispatch: vi.fn(async () => {
          throw new Error('Eve unavailable');
        }),
      })
    );

    const response = await handler(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'eve_dispatch_failed',
      receiptPath: expect.stringMatching(/^summer-shadow\/receipts\//u),
    });
    expect(persistImmutable).toHaveBeenCalledTimes(3);
  });

  it('fails closed when the immutable terminal path already exists', async () => {
    const persistImmutable = vi
      .fn()
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('exists');
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable })
    );

    const response = await handler(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'terminal_receipt_conflict',
      sessionId: 'ses_shadow_1',
    });
  });

  it('rejects a duplicate per-session turn reservation before dispatch', async () => {
    const dispatch = vi.fn();
    const persistImmutable = vi
      .fn()
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('exists');
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable, dispatch })
    );

    const response = await handler(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: 'session_budget_rejected',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a duplicate daily slot reservation before dispatch', async () => {
    const dispatch = vi.fn();
    const persistImmutable = vi
      .fn()
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('exists');
    const handler = createSummerShadowIngressHandler(
      dependencies({ persistImmutable, dispatch })
    );

    const response = await handler(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: 'daily_budget_rejected',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses one stable continuation key for five bounded turns', async () => {
    const dispatch = vi.fn(async () => ({ sessionId: 'ses_shadow_1' }));
    const handler = createSummerShadowIngressHandler(
      dependencies({ dispatch })
    );

    for (let turn = 1; turn <= 5; turn += 1) {
      const response = await handler(
        request(
          event({
            eventId: `evt_shadow_turn_${turn}`,
            turn,
            dailySlot: turn,
          })
        )
      );
      expect(response.status).toBe(202);
    }

    const continuationKeys = dispatch.mock.calls.map(
      ([input]) => input.conversationKey
    );
    expect(new Set(continuationKeys).size).toBe(1);
  });

  it('renders only the allowlisted read-only tool request', () => {
    const rendered = renderSummerShadowObservation(
      event({ requestedCapability: 'core_chat' }) as SummerShadowEvent
    );

    expect(rendered).toContain(
      'Call exactly jovie_capability_manifest once with capability core_chat'
    );
    expect(rendered).toContain('Do not call any other tool');
    expect(rendered).toContain('Never dispatch work or mutate');
  });

  it('uses runtime deployment metadata and the no-evidence rendering path', async () => {
    const previous = {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
      environment: process.env.VERCEL_ENV,
      url: process.env.VERCEL_URL,
    };
    process.env.VERCEL_GIT_COMMIT_SHA = 'runtime-sha';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_runtime';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'runtime-eve.vercel.app';

    try {
      const handler = createSummerShadowIngressHandler({
        authenticate: vi.fn(async () => signedAuth),
        dispatch: vi.fn(async () => ({ sessionId: 'ses_runtime' })),
        enabled: () => true,
        persistImmutable: vi.fn(async () => 'created' as const),
      });

      const response = await handler(
        request({
          schema: 'jovie.ovie-summer-shadow.event/v1',
          eventId: 'evt_shadow_runtime',
          conversationId: 'conv_shadow_runtime',
          turn: 1,
          dailySlot: 1,
          occurredAt: new Date().toISOString(),
          message: 'Runtime deployment proof.',
        })
      );

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({
        deployment: {
          commitSha: 'runtime-sha',
          deploymentId: 'dpl_runtime',
          environment: 'preview',
          url: 'https://runtime-eve.vercel.app',
        },
      });
    } finally {
      if (previous.commitSha === undefined)
        delete process.env.VERCEL_GIT_COMMIT_SHA;
      else process.env.VERCEL_GIT_COMMIT_SHA = previous.commitSha;
      if (previous.deploymentId === undefined)
        delete process.env.VERCEL_DEPLOYMENT_ID;
      else process.env.VERCEL_DEPLOYMENT_ID = previous.deploymentId;
      if (previous.environment === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous.environment;
      if (previous.url === undefined) delete process.env.VERCEL_URL;
      else process.env.VERCEL_URL = previous.url;
    }
  });
});
