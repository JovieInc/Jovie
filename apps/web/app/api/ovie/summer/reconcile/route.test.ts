vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: mocks.requireOvieApiAccess,
}));

vi.mock('./target', () => ({
  SUMMER_RECOVERY_TARGET: {
    eventId: 'sum_aaaaaaaaaaaaaaaaaaaaaaaa',
    deploymentId: 'dpl_original',
    sessionId: 'wrun_existing',
    clientTurnId: '00000000-0000-4000-8000-000000000001',
    startIndex: 7,
    dailySlot: 1,
    utcDay: '2026-10-14',
    admittedAt: '2026-10-14T18:55:45.649Z',
  },
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_ERRORS } from '@/lib/auth/session';
import {
  MemoryOperatingStore,
  memoryRecordBackend,
  type RecordBackend,
} from '@/lib/ovie/mcp/store';
import {
  appendSummerTurn,
  loadCurrentSummerSession,
} from '@/lib/ovie/summer-session';

const mocks = vi.hoisted(() => ({
  fetchSummerShadow: vi.fn(),
  getOvieOperatingStore: vi.fn(),
  getSessionContext: vi.fn(),
  loggerError: vi.fn(),
  requireOvieApiAccess: vi.fn(),
}));

vi.mock('@/lib/auth/session', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSessionContext: mocks.getSessionContext,
}));
vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: mocks.getOvieOperatingStore,
}));
vi.mock('@/lib/ovie/summer-shadow-client', () => ({
  fetchSummerShadow: mocks.fetchSummerShadow,
}));
vi.mock('@/lib/ovie/summer-production-pin', () => ({
  resolveSummerEveCallerOrigin: vi.fn(async () => ({
    origin: 'https://summer.jov.ie',
    deploymentId: 'dpl_current',
  })),
  SummerPinInvalidError: class SummerPinInvalidError extends Error {
    readonly code = 'summer_pin_invalid';
  },
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.loggerError },
}));

import {
  resolveSummerEveCallerOrigin,
  SummerPinInvalidError,
} from '@/lib/ovie/summer-production-pin';
import * as routeModule from './route';
import { SUMMER_RECOVERY_TARGET } from './target';

const { GET } = routeModule;

const founderUserId = '7ddcab54-41ae-4404-88e8-6ec71bc9ba03';
const principalHash = 'Tl8Kg6UKfQPtm7_HmbX0nKUaXaqoeDq8g3eDXeN4HFg';
const currentDeploymentId = 'dpl_current';

class InjectBeforeFirstDecisionCasStore extends MemoryOperatingStore {
  private injected = false;

  constructor(
    backend: RecordBackend,
    private readonly inject: () => Promise<void>
  ) {
    super(backend);
  }

  override async putDecisionIfUnchanged(
    ...args: Parameters<MemoryOperatingStore['putDecisionIfUnchanged']>
  ): Promise<boolean> {
    if (!this.injected) {
      this.injected = true;
      await this.inject();
    }
    return super.putDecisionIfUnchanged(...args);
  }
}

function durableTurn(
  clientTurnId: string,
  assistantText: string,
  eventId?: string
) {
  return {
    clientTurnId,
    userText: '',
    assistantText,
    eveWorkId: null,
    eveAcks: [],
    correlationId: clientTurnId,
    state: 'completed',
    toolReceipt: null,
    ...(eventId
      ? {
          eveReceipt: {
            eventId,
            sessionId: SUMMER_RECOVERY_TARGET.sessionId,
            turnId: 'turn_recovered',
            nextStartIndex: 8,
          },
        }
      : {}),
    createdAt: '2026-09-09T00:00:00.000Z',
  } as const;
}

function resultResponse(
  overrides: Readonly<Record<string, unknown>> = {},
  init: ResponseInit = {}
) {
  return Response.json(
    {
      ok: true,
      result: {
        eventId: SUMMER_RECOVERY_TARGET.eventId,
        conversationId: 'summer-session-current',
        principalHash,
        deploymentId: SUMMER_RECOVERY_TARGET.deploymentId,
        sessionId: SUMMER_RECOVERY_TARGET.sessionId,
        startIndex: SUMMER_RECOVERY_TARGET.startIndex,
        dailySlot: SUMMER_RECOVERY_TARGET.dailySlot,
        utcDay: SUMMER_RECOVERY_TARGET.utcDay,
        admittedAt: SUMMER_RECOVERY_TARGET.admittedAt,
        turnId: 'turn_recovered',
        responseText: 'Recovered exact Summer response.',
        status: 'completed',
        nextStartIndex: 8,
        model: 'zai/glm-5.3-flash',
        ...overrides,
      },
    },
    {
      status: 200,
      ...init,
      headers: {
        'x-jovie-eve-deployment-id': currentDeploymentId,
        ...init.headers,
      },
    }
  );
}

describe('GET /api/ovie/summer/reconcile', () => {
  let store: MemoryOperatingStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOvieApiAccess.mockResolvedValue(null);
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('OVIE_SUMMER_FOUNDER_APP_USER_ID', founderUserId);
    store = new MemoryOperatingStore();
    mocks.getOvieOperatingStore.mockReturnValue(store);
    mocks.getSessionContext.mockResolvedValue({
      clerkUserId: founderUserId,
      user: { id: founderUserId },
      profile: null,
    });
    mocks.fetchSummerShadow.mockImplementation(async () => resultResponse());
  });

  afterEach(() => vi.unstubAllEnvs());

  it('exports no mutating route handler', () => {
    expect(Object.keys(routeModule).sort()).toEqual([
      'GET',
      'dynamic',
      'runtime',
    ]);
  });

  it('uses one GET for the source-bound event and persists the exact result', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      persisted: 'created',
    });
    expect(mocks.fetchSummerShadow).toHaveBeenCalledOnce();
    expect(mocks.fetchSummerShadow).toHaveBeenCalledWith(
      `/ovie/v1/summer-shadow/conversation/events/${SUMMER_RECOVERY_TARGET.eventId}/result`,
      {
        method: 'GET',
        headers: {
          'x-jovie-summer-principal-hash': principalHash,
          'x-jovie-summer-deployment-id': SUMMER_RECOVERY_TARGET.deploymentId,
        },
      }
    );
    const session = await loadCurrentSummerSession(store);
    expect(session?.turns[0]).toMatchObject({
      clientTurnId: SUMMER_RECOVERY_TARGET.clientTurnId,
      userText: '',
      assistantText: 'Recovered exact Summer response.',
      state: 'completed',
      eveReceipt: { eventId: SUMMER_RECOVERY_TARGET.eventId },
    });
  });

  it('is idempotent and never sends a POST', async () => {
    expect((await GET()).status).toBe(200);
    const second = await GET();

    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      ok: true,
      persisted: 'existing',
    });
    expect(mocks.fetchSummerShadow).toHaveBeenCalledTimes(2);
    for (const [, init] of mocks.fetchSummerShadow.mock.calls) {
      expect(init).toMatchObject({ method: 'GET' });
      expect(init?.method).not.toBe('POST');
    }
    expect((await loadCurrentSummerSession(store))?.turns).toHaveLength(1);
  });

  it('reuses the immutable Eve event even when its client turn id is legacy', async () => {
    await appendSummerTurn(
      store,
      durableTurn(
        'legacy-client-turn',
        'Recovered exact Summer response.',
        SUMMER_RECOVERY_TARGET.eventId
      )
    );
    await expect((await GET()).json()).resolves.toMatchObject({
      persisted: 'existing',
    });
    expect((await loadCurrentSummerSession(store))?.turns).toHaveLength(1);
  });

  it('rejects an unauthenticated session before signed upstream access', async () => {
    mocks.getSessionContext.mockRejectedValue(
      new TypeError(SESSION_ERRORS.UNAUTHORIZED)
    );
    expect((await GET()).status).toBe(401);
    expect(mocks.fetchSummerShadow).not.toHaveBeenCalled();
  });

  it('fails closed when session lookup is unavailable', async () => {
    mocks.getSessionContext.mockRejectedValue(new Error('session unavailable'));
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'founder_session_unavailable',
    });
  });

  it('rejects a different authenticated user before signed upstream access', async () => {
    mocks.getSessionContext.mockResolvedValue({
      clerkUserId: '00000000-0000-4000-8000-000000000000',
      user: { id: '00000000-0000-4000-8000-000000000000' },
      profile: null,
    });

    expect((await GET()).status).toBe(403);
    expect(mocks.fetchSummerShadow).not.toHaveBeenCalled();
  });

  it.each([
    ['founder identity', 'OVIE_SUMMER_FOUNDER_APP_USER_ID'],
    ['production origin', 'VERCEL_ENV'],
  ] as const)('fails closed when %s is unavailable', async (_name, key) => {
    vi.stubEnv(key, key === 'VERCEL_ENV' ? 'preview' : '');
    expect((await GET()).status).toBe(503);
    expect(mocks.fetchSummerShadow).not.toHaveBeenCalled();
  });

  it('returns 503 when the production alias identity is invalid', async () => {
    vi.mocked(resolveSummerEveCallerOrigin).mockRejectedValueOnce(
      new SummerPinInvalidError(
        {
          origin: 'https://summer.jov.ie',
          projectId: 'prj_LaVQva346cjp5XfrbAIIQUln7tPH',
          environment: 'production',
          status: 'source-bound',
        },
        { status: 404 }
      )
    );
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'summer_pin_invalid',
    });
    expect(mocks.fetchSummerShadow).not.toHaveBeenCalled();
  });

  it('does not persist an unavailable or unverified upstream result', async () => {
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      Response.json(
        {
          ok: false,
          code: 'turn_pending',
          eventId: SUMMER_RECOVERY_TARGET.eventId,
        },
        {
          status: 503,
          headers: { 'x-jovie-eve-deployment-id': currentDeploymentId },
        }
      )
    );
    expect((await GET()).status).toBe(503);
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();

    mocks.fetchSummerShadow.mockResolvedValueOnce(
      resultResponse(
        {},
        {
          headers: { 'x-jovie-eve-deployment-id': 'dpl_foreign' },
        }
      )
    );
    expect((await GET()).status).toBe(503);
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it('fails closed when the server-signed Summer read throws', async () => {
    mocks.fetchSummerShadow.mockRejectedValue(new Error('OIDC unavailable'));
    expect((await GET()).status).toBe(503);
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it.each([
    ['eventId', { eventId: `sum_${'z'.repeat(24)}` }],
    ['principalHash', { principalHash: 'b'.repeat(43) }],
    ['deploymentId', { deploymentId: 'dpl_foreign' }],
    ['sessionId', { sessionId: 'wrun_foreign' }],
    ['startIndex', { startIndex: SUMMER_RECOVERY_TARGET.startIndex + 1 }],
    ['dailySlot', { dailySlot: 2 }],
    ['utcDay', { utcDay: '2026-10-15' }],
    ['admittedAt', { admittedAt: '2026-10-14T18:55:46.649Z' }],
  ])('rejects %s binding drift without persistence', async (_field, drift) => {
    mocks.fetchSummerShadow.mockResolvedValue(resultResponse(drift));

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: 'summer_result_binding_drift',
    });
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it.each([
    ['unsupported session identity', { sessionId: 'run_unknown' }],
    ['empty turn identity', { turnId: '' }],
    ['backward result cursor', { nextStartIndex: 6 }],
    ['unsafe result cursor', { nextStartIndex: Number.MAX_SAFE_INTEGER + 1 }],
    ['unknown field', { unexpected: true }],
    ['invalid admission date', { utcDay: 'yesterday' }],
    ['invalid admission timestamp', { admittedAt: 'yesterday' }],
    ['invalid daily slot', { dailySlot: 26 }],
  ])(
    'rejects %s as an invalid result without persistence',
    async (_field, drift) => {
      mocks.fetchSummerShadow.mockResolvedValue(resultResponse(drift));

      const response = await GET();

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        code: 'invalid_summer_result',
      });
      expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
    }
  );

  it('does not persist a failed terminal result', async () => {
    mocks.fetchSummerShadow.mockResolvedValue(
      resultResponse({ status: 'failed' })
    );
    const response = await GET();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'summer_result_failed',
    });
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it('does not persist an empty completed response', async () => {
    mocks.fetchSummerShadow.mockResolvedValue(
      resultResponse({ responseText: ' ' })
    );
    expect((await GET()).status).toBe(409);
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it('rejects an oversized streamed response before persistence', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(128 * 1024 + 1));
      },
    });
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { 'x-jovie-eve-deployment-id': currentDeploymentId },
      })
    );
    expect((await GET()).status).toBe(502);

    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it('detects a conflicting recovery committed during its compare-and-set window', async () => {
    const backend = memoryRecordBackend();
    const writer = new MemoryOperatingStore(backend);
    store = new InjectBeforeFirstDecisionCasStore(backend, async () => {
      await appendSummerTurn(
        writer,
        durableTurn(
          `summer-reconcile:${SUMMER_RECOVERY_TARGET.eventId}`,
          'A concurrently committed conflicting response.',
          SUMMER_RECOVERY_TARGET.eventId
        )
      );
    });
    mocks.getOvieOperatingStore.mockReturnValue(store);

    const response = await GET();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'persisted_result_drift',
    });
    expect(
      (await loadCurrentSummerSession(store))?.turns[0]?.assistantText
    ).toBe('A concurrently committed conflicting response.');
  });

  it('retries after a concurrent unrelated append and preserves both turns', async () => {
    const backend = memoryRecordBackend();
    const writer = new MemoryOperatingStore(backend);
    store = new InjectBeforeFirstDecisionCasStore(backend, async () => {
      await appendSummerTurn(
        writer,
        durableTurn('unrelated-concurrent-turn', 'Unrelated Summer history.')
      );
    });
    mocks.getOvieOperatingStore.mockReturnValue(store);

    expect((await GET()).status).toBe(200);
    const session = await loadCurrentSummerSession(store);
    expect(session?.turns.map(turn => turn.clientTurnId)).toEqual([
      'unrelated-concurrent-turn',
      SUMMER_RECOVERY_TARGET.clientTurnId,
    ]);
  });

  it('accepts the documented legacy absence of the optional admission timestamp', async () => {
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      resultResponse({ admittedAt: undefined })
    );
    expect((await GET()).status).toBe(200);
  });

  it('ignores caller-supplied target selectors', async () => {
    await Reflect.apply(GET, undefined, [
      new Request(
        'https://jov.ie/api/ovie/summer/reconcile?eventId=sum_bbbbbbbbbbbbbbbbbbbbbbbb&deploymentId=dpl_foreign'
      ),
    ]);
    expect(mocks.fetchSummerShadow.mock.calls[0]?.[0]).toBe(
      `/ovie/v1/summer-shadow/conversation/events/${SUMMER_RECOVERY_TARGET.eventId}/result`
    );
    expect(mocks.fetchSummerShadow.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-jovie-summer-deployment-id': SUMMER_RECOVERY_TARGET.deploymentId,
    });
  });

  it.each([201, 503])(
    'rejects a success envelope at status %s',
    async status => {
      mocks.fetchSummerShadow.mockResolvedValueOnce(
        resultResponse({}, { status })
      );
      expect((await GET()).status).toBe(502);
      expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
    }
  );

  it('denies the privacy lock before upstream or store access', async () => {
    mocks.requireOvieApiAccess.mockResolvedValueOnce(
      Response.json({ ok: false }, { status: 423 })
    );
    expect((await GET()).status).toBe(423);
    expect(mocks.fetchSummerShadow).not.toHaveBeenCalled();
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it.each([
    'turn_pending',
    'accepted_turn_unavailable',
    'terminal_unavailable',
    'conversation_result_unavailable',
  ])('leaves %s unresolved without history writes', async code => {
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      Response.json(
        {
          ok: false,
          code,
          ...(code === 'turn_pending'
            ? { eventId: SUMMER_RECOVERY_TARGET.eventId }
            : {}),
        },
        {
          status: 503,
          headers: { 'x-jovie-eve-deployment-id': currentDeploymentId },
        }
      )
    );
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'summer_result_pending',
      upstreamCode: code,
    });
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it('surfaces terminal abandonment without a replacement input or history mutation', async () => {
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      Response.json(
        { ok: false, code: 'dispatch_abandoned' },
        {
          status: 410,
          headers: { 'x-jovie-eve-deployment-id': currentDeploymentId },
        }
      )
    );
    const response = await GET();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'summer_dispatch_abandoned',
    });
    expect(mocks.fetchSummerShadow).toHaveBeenCalledOnce();
    expect(mocks.fetchSummerShadow.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
    });
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it.each([
    [
      410,
      {
        ok: false,
        code: 'turn_pending',
        eventId: SUMMER_RECOVERY_TARGET.eventId,
      },
    ],
    [503, { ok: false, code: 'dispatch_abandoned' }],
    [200, { ok: false, code: 'dispatch_abandoned' }],
    [503, { ok: false, code: 'unknown_error' }],
    [
      503,
      {
        ok: false,
        code: 'turn_pending',
        eventId: 'sum_bbbbbbbbbbbbbbbbbbbbbbbb',
      },
    ],
    [503, { ok: false, code: 'turn_pending' }],
    [503, { ok: false, code: 'accepted_turn_unavailable', unexpected: true }],
  ])(
    'fails closed for status %s and an unverified error envelope',
    async (status, body) => {
      mocks.fetchSummerShadow.mockResolvedValueOnce(
        Response.json(body, {
          status,
          headers: { 'x-jovie-eve-deployment-id': currentDeploymentId },
        })
      );
      expect((await GET()).status).toBe(502);
      expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
    }
  );

  it.each([200, 503])(
    'bounds a stalled response body at status %s and cancels its reader',
    async status => {
      const body =
        status === 200
          ? await resultResponse().text()
          : JSON.stringify({ ok: false, code: 'accepted_turn_unavailable' });
      const cancel = vi.fn();
      mocks.fetchSummerShadow.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(body));
            },
            cancel,
          }),
          {
            status,
            headers: { 'x-jovie-eve-deployment-id': currentDeploymentId },
          }
        )
      );
      vi.useFakeTimers();
      try {
        const pending = GET();
        await vi.advanceTimersByTimeAsync(5_001);
        const response = await pending;
        expect(response.status).toBe(502);
        expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
        expect(cancel).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it.each([200, 503])('rejects malformed JSON at status %s', async status => {
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      new Response('{', {
        status,
        headers: { 'x-jovie-eve-deployment-id': currentDeploymentId },
      })
    );
    expect((await GET()).status).toBe(502);
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it.each([200, 503])(
    'rejects a declared oversized body at status %s',
    async status => {
      mocks.fetchSummerShadow.mockResolvedValueOnce(
        new Response('{}', {
          status,
          headers: {
            'content-length': String(128 * 1024 + 1),
            'x-jovie-eve-deployment-id': currentDeploymentId,
          },
        })
      );
      expect((await GET()).status).toBe(502);
      expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
    }
  );

  it('rejects a missing response body', async () => {
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { 'x-jovie-eve-deployment-id': currentDeploymentId },
      })
    );
    expect((await GET()).status).toBe(502);
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it('preserves an original pending input that appears during a CAS retry', async () => {
    const backend = memoryRecordBackend();
    const writer = new MemoryOperatingStore(backend);
    const pending = {
      ...durableTurn(SUMMER_RECOVERY_TARGET.clientTurnId, ''),
      userText: 'Original user input',
      correlationId: 'original-correlation',
      state: 'pending',
      eveCheckpoint: {
        eventId: SUMMER_RECOVERY_TARGET.eventId,
        sessionId: SUMMER_RECOVERY_TARGET.sessionId,
        nextStartIndex: SUMMER_RECOVERY_TARGET.startIndex,
      },
    };
    store = new InjectBeforeFirstDecisionCasStore(backend, async () => {
      await appendSummerTurn(writer, pending);
    });
    mocks.getOvieOperatingStore.mockReturnValue(store);
    expect((await GET()).status).toBe(200);
    const turns = (await loadCurrentSummerSession(store))?.turns;
    expect(turns).toHaveLength(1);
    expect(turns?.[0]).toMatchObject({
      clientTurnId: pending.clientTurnId,
      userText: pending.userText,
      correlationId: pending.correlationId,
      createdAt: pending.createdAt,
      turnIndex: 1,
      state: 'completed',
      assistantText: 'Recovered exact Summer response.',
      eveReceipt: { eventId: SUMMER_RECOVERY_TARGET.eventId },
    });
  });

  it.each(['pending-first', 'legacy-first', 'concurrent'])(
    'holds distinct client/event owners without duplicating a receipt (%s)',
    async order => {
      const concurrent = order === 'concurrent';
      const backend = memoryRecordBackend();
      const writer = new MemoryOperatingStore(backend);
      const pending = {
        ...durableTurn(SUMMER_RECOVERY_TARGET.clientTurnId, ''),
        userText: 'Original input',
        state: 'pending',
        eveCheckpoint: {
          eventId: SUMMER_RECOVERY_TARGET.eventId,
          sessionId: SUMMER_RECOVERY_TARGET.sessionId,
          nextStartIndex: SUMMER_RECOVERY_TARGET.startIndex,
        },
      };
      const legacy = durableTurn(
        'legacy-client-turn',
        'Recovered exact Summer response.',
        SUMMER_RECOVERY_TARGET.eventId
      );
      if (order === 'legacy-first') await appendSummerTurn(writer, legacy);
      await appendSummerTurn(writer, pending);
      if (order === 'pending-first') await appendSummerTurn(writer, legacy);
      store = concurrent
        ? new InjectBeforeFirstDecisionCasStore(backend, async () => {
            await appendSummerTurn(writer, legacy);
          })
        : writer;
      mocks.getOvieOperatingStore.mockReturnValue(store);
      const response = await GET();
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: 'persisted_result_drift',
      });
      const ordered =
        order === 'legacy-first' ? [legacy, pending] : [pending, legacy];
      expect((await loadCurrentSummerSession(store))?.turns).toEqual(
        ordered.map((turn, index) => ({ ...turn, turnIndex: index + 1 }))
      );
    }
  );

  it('preserves a conflicting pending checkpoint inserted during CAS', async () => {
    const backend = memoryRecordBackend();
    const writer = new MemoryOperatingStore(backend);
    const pending = {
      ...durableTurn(SUMMER_RECOVERY_TARGET.clientTurnId, ''),
      state: 'pending',
      eveCheckpoint: {
        eventId: 'sum_bbbbbbbbbbbbbbbbbbbbbbbb',
        sessionId: SUMMER_RECOVERY_TARGET.sessionId,
        nextStartIndex: SUMMER_RECOVERY_TARGET.startIndex,
      },
    };
    store = new InjectBeforeFirstDecisionCasStore(backend, async () => {
      await appendSummerTurn(writer, pending);
    });
    mocks.getOvieOperatingStore.mockReturnValue(store);
    expect((await GET()).status).toBe(409);
    expect((await loadCurrentSummerSession(store))?.turns).toEqual([
      { ...pending, turnIndex: 1 },
    ]);
  });

  it('fails closed when canonical persistence is unavailable', async () => {
    mocks.getOvieOperatingStore.mockImplementation(() => {
      throw new Error('store unavailable');
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mocks.loggerError).toHaveBeenCalledOnce();
  });
});
