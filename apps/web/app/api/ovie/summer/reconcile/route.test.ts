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
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.loggerError },
}));

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
            nextStartIndex: 7,
          },
        }
      : {}),
    createdAt: '2026-09-09T00:00:00.000Z',
  } as const;
}

function resultResponse(
  overrides: Partial<{
    eventId: string;
    principalHash: string;
    deploymentId: string;
    sessionId: string;
    turnId: string;
    responseText: string;
    status: 'completed' | 'failed';
    nextStartIndex: number;
  }> = {},
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
        turnId: 'turn_recovered',
        responseText: 'Recovered exact Summer response.',
        status: 'completed',
        nextStartIndex: 7,
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
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('OVIE_SUMMER_FOUNDER_APP_USER_ID', founderUserId);
    vi.stubEnv('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID', currentDeploymentId);
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
      clientTurnId: `summer-reconcile:${SUMMER_RECOVERY_TARGET.eventId}`,
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
    ['current Eve deployment', 'OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID'],
    ['production origin', 'VERCEL_ENV'],
  ] as const)('fails closed when %s is unavailable', async (_name, key) => {
    vi.stubEnv(key, key === 'VERCEL_ENV' ? 'preview' : '');
    expect((await GET()).status).toBe(503);
    expect(mocks.fetchSummerShadow).not.toHaveBeenCalled();
  });

  it('does not persist an unavailable or unverified upstream result', async () => {
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      Response.json(
        { ok: false, code: 'turn_pending' },
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
  ])('rejects %s as an invalid result without persistence', async (_field, drift) => {
    mocks.fetchSummerShadow.mockResolvedValue(resultResponse(drift));

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_summer_result',
    });
    expect(mocks.getOvieOperatingStore).not.toHaveBeenCalled();
  });

  it('does not persist a failed terminal result', async () => {
    mocks.fetchSummerShadow.mockResolvedValue(
      resultResponse({ status: 'failed' })
    );
    expect((await GET()).status).toBe(409);
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
      `summer-reconcile:${SUMMER_RECOVERY_TARGET.eventId}`,
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
