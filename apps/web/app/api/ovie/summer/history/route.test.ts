import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FailoverOperatingStore,
  MemoryOperatingStore,
} from '@/lib/ovie/mcp/store';
import {
  CURRENT_SUMMER_IDENTITY,
  SUMMER_SESSION_DECISION_ID,
} from '@/lib/ovie/summer-session';
import { GET } from './route';

const h = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(),
  store: vi.fn(),
  env: { OVIE_SUMMER_FOUNDER_APP_USER_ID: 'founder' },
}));
vi.mock('@/lib/auth/session', () => ({ getSessionContext: h.session }));
vi.mock('@/lib/chat/ov-mode', () => ({ canUseOvChatMode: h.admin }));
vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: h.store,
}));
vi.mock('@/lib/env-server', () => ({ env: h.env }));

function turn(index = 1, state = 'completed') {
  return {
    turnIndex: index,
    clientTurnId: `client-${index}`,
    userText: `Question ${index}`,
    assistantText: `Answer ${index}`,
    state,
    createdAt: '2026-09-20T00:00:00.000Z',
    toolReceipt: null,
    eveReceipt: {
      eventId: 'private-event',
      sessionId: 'private-session',
      turnId: 'private-turn',
      nextStartIndex: 9,
    },
    correlationId: 'private-correlation',
    eveAcks: ['private-ack'],
    eveWorkId: 'private-work',
  };
}

function record(turns = [turn()], identity: object = CURRENT_SUMMER_IDENTITY) {
  return { identity, turns };
}

describe('founder Summer history readback', () => {
  let store: MemoryOperatingStore;
  beforeEach(() => {
    vi.clearAllMocks();
    h.env.OVIE_SUMMER_FOUNDER_APP_USER_ID = 'founder';
    h.session.mockResolvedValue({ user: { id: 'founder' } });
    h.admin.mockResolvedValue(true);
    store = new MemoryOperatingStore();
    h.store.mockReturnValue(store);
  });

  async function seed(value: unknown) {
    await store.putDecision({
      id: SUMMER_SESSION_DECISION_ID,
      kind: 'decision',
      decided: typeof value === 'string' ? value : JSON.stringify(value),
      why: 'fixture',
      provenance: 'test',
      createdAt: '2026-09-20T00:00:00.000Z',
    });
  }

  it('projects only display history, with stable role-specific dedupe ids and no provider receipt leakage', async () => {
    await seed({
      identity: CURRENT_SUMMER_IDENTITY,
      turns: [turn(2), turn(1)],
    });
    const write = vi.spyOn(store, 'putDecision');
    const cas = vi.spyOn(store, 'putDecisionIfUnchanged');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body).toEqual({
      chatMode: 'ov',
      conversation: { id: CURRENT_SUMMER_IDENTITY.sessionId, title: 'Summer' },
      hasMore: false,
      messages: [1, 2].flatMap(index => [
        {
          id: `summer-history:${index}:user`,
          role: 'user',
          content: `Question ${index}`,
          clientMessageId: `client-${index}:user`,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
        {
          id: `summer-history:${index}:assistant`,
          role: 'assistant',
          content: `Answer ${index}`,
          clientMessageId: `assistant:client-${index}`,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
      ]),
    });
    expect(JSON.stringify(body)).not.toContain('private-');
    expect(await (await GET()).json()).toEqual(body);
    expect(write).not.toHaveBeenCalled();
    expect(cas).not.toHaveBeenCalled();
  });

  it('reads authoritative fallback without filling or trusting a stale cache', async () => {
    await seed({ identity: CURRENT_SUMMER_IDENTITY, turns: [turn()] });
    const primary = new MemoryOperatingStore();
    const cacheWrite = vi.spyOn(primary, 'putDecisionIfUnchanged');
    const cacheRead = vi.spyOn(primary, 'getDecision');
    h.store.mockReturnValue(
      new FailoverOperatingStore({
        primary,
        fallback: store,
        writeThrough: true,
        isPrimaryFailure: () => true,
      })
    );
    expect((await GET()).status).toBe(200);
    expect(cacheRead).not.toHaveBeenCalled();
    expect(cacheWrite).not.toHaveBeenCalled();
  });

  it.each(['failed', 'unavailable', 'unknown', 'canceled', 'running'])(
    'discloses recorded %s state without treating it as a new answer',
    async state => {
      await seed({
        identity: CURRENT_SUMMER_IDENTITY,
        turns: [
          {
            ...turn(1, state),
            assistantText: '',
            userText: '',
            clientTurnId: null,
          },
        ],
      });
      const body = await (await GET()).json();
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].content).toContain(
        `Summer turn status: ${state}.`
      );
      expect(body.messages[0].content).toContain('Do not resend');
      expect(body.messages[0].clientMessageId).toBeNull();
    }
  );

  it.each([true, false])(
    'shows recorded tool result ok=%s without executing tools',
    async ok => {
      await seed({
        identity: CURRENT_SUMMER_IDENTITY,
        turns: [
          {
            ...turn(),
            toolReceipt: {
              ok,
              summary: 'Recorded result',
              receiptId: 'private-receipt',
              tool: 'get_org_state',
            },
          },
        ],
      });
      const text = JSON.stringify(await (await GET()).json());
      expect(text).toContain(
        `Recorded tool result (${ok ? 'succeeded' : 'failed'})`
      );
      expect(text).not.toContain('private-receipt');
    }
  );

  it('distinguishes an existing empty session from a missing session without creating either', async () => {
    const cas = vi.spyOn(store, 'putDecisionIfUnchanged');
    expect((await GET()).status).toBe(404);
    expect(cas).not.toHaveBeenCalled();
    await seed({ identity: CURRENT_SUMMER_IDENTITY, turns: [] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).messages).toEqual([]);
    expect(cas).not.toHaveBeenCalled();
  });

  it.each([
    ...Object.entries({
      runtime: 'mac',
      memoryNamespace: 'jovie-artist',
      sessionId: 'other',
    }).map(([key, value]) => [
      `wrong ${key}`,
      record([turn()], { ...CURRENT_SUMMER_IDENTITY, [key]: value }),
    ]),
    ['invalid JSON', '{'],
    ['invalid turns', record([{ ...turn(), createdAt: 'invalid' }])],
    ['duplicate index', record([turn(), { ...turn(2), turnIndex: 1 }])],
    [
      'duplicate client',
      record([turn(), { ...turn(2), clientTurnId: 'client-1' }]),
    ],
  ])('rejects %s without migration or repair writes', async (_name, value) => {
    await seed(value);
    const before = await store.getDecisionForUpdate(SUMMER_SESSION_DECISION_ID);
    const cas = vi.spyOn(store, 'putDecisionIfUnchanged');
    const response = await GET();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('could not be verified');
    expect(
      await store.getDecisionForUpdate(SUMMER_SESSION_DECISION_ID)
    ).toEqual(before);
    expect(cas).not.toHaveBeenCalled();
  });

  it.each([
    ['customer', 'founder', 403],
    ['admin-not-founder', 'founder', 403],
    ['founder', '', 503],
  ])(
    'denies user=%s with binding=%s before accessing history',
    async (id, founder, status) => {
      h.session.mockResolvedValue({ user: { id } });
      h.env.OVIE_SUMMER_FOUNDER_APP_USER_ID = founder;
      const response = await GET();
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(h.store).not.toHaveBeenCalled();
    }
  );

  it('denies a configured founder whose admin role was revoked before reading history', async () => {
    h.admin.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(h.admin).toHaveBeenCalledWith('founder');
    expect(h.store).not.toHaveBeenCalled();
  });

  it('fails closed when current admin status cannot be checked', async () => {
    h.admin.mockRejectedValue(new Error('private role backend detail'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      'private role backend detail'
    );
    expect(h.store).not.toHaveBeenCalled();
  });

  it.each([
    ['Unauthorized', 401],
    ['auth backend unavailable', 503],
  ])('fails closed on session error %s', async (message, status) => {
    h.session.mockRejectedValue(new Error(message));
    expect((await GET()).status).toBe(status);
    expect(h.store).not.toHaveBeenCalled();
  });

  it('discloses unavailable storage without leaking backend details', async () => {
    vi.spyOn(store, 'getDecisionForUpdate').mockRejectedValue(
      new Error('private storage detail')
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      'private storage detail'
    );
  });
});
