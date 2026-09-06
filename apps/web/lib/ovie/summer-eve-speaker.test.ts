import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ovie/summer-shadow-client', () => ({
  fetchSummerShadow: vi.fn(),
}));

import type { ShadowRecord } from '../../../eve-pilot/agent/lib/summer-shadow-ingress';
import {
  type ConversationInput,
  createConversationIngress,
  readConversationResult,
  renderConversation,
} from '../../../eve-pilot/agent/lib/summer-web-conversation';
import { MemoryOperatingStore } from './mcp/store';
import { ovieSummerTurnId } from './summer-conversation';
import { createEveSummerSpeaker } from './summer-eve-speaker';
import {
  CURRENT_SUMMER_SESSION_ID,
  loadCurrentSummerSession,
  openCurrentSummerSession,
  SUMMER_SESSION_DECISION_ID,
} from './summer-session';
import {
  runOvieSummerTurn,
  type SummerSpeaker,
  type SummerSpeakInput,
} from './summer-transport';

const input: SummerSpeakInput = {
  clientTurnId: 'client_1',
  principalHash: 'a'.repeat(43),
  userText: 'Hello Summer',
  history: [],
};
const eventId = ovieSummerTurnId({
  conversationId: CURRENT_SUMMER_SESSION_ID,
  clientTurnId: 'client_1',
});
const result = {
  eventId,
  conversationId: 'summer-session-current',
  principalHash: input.principalHash,
  deploymentId: 'dpl_test',
  sessionId: 'ses_summer',
  turnId: 'turn_1',
  responseText: 'Hello Tim, Summer Jovi here.',
  status: 'completed',
  nextStartIndex: 7,
  model: 'zai/glm-5.3-flash',
};
const fetchShadow =
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
const eveResponse = (
  body: unknown,
  init?: Omit<ResponseInit, 'headers'> & { headers?: HeadersInit }
) =>
  Response.json(body, {
    ...init,
    headers: {
      'x-jovie-eve-deployment-id': 'dpl_test',
      ...init?.headers,
    },
  });
async function collect(value = input) {
  const events = [];
  for await (const e of createEveSummerSpeaker(fetchShadow).speak(value))
    events.push(e);
  return events;
}
beforeEach(() => {
  vi.stubEnv('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID', 'dpl_test');
  fetchShadow.mockReset();
  fetchShadow
    .mockResolvedValueOnce(
      eveResponse({ ok: true, accepted: { eventId } }, { status: 202 })
    )
    .mockResolvedValueOnce(eveResponse({ ok: true, result }));
});
afterEach(() => vi.unstubAllEnvs());
describe('Ovie speaks through durable Eve Summer', () => {
  it('delivers the matching terminal answer and receipt through canonical persistence', async () => {
    const store = new MemoryOperatingStore();
    const events = [];
    for await (const e of runOvieSummerTurn({
      store,
      speaker: createEveSummerSpeaker(fetchShadow),
      userText: input.userText,
      clientTurnId: input.clientTurnId,
      principalHash: input.principalHash,
      receipts: [],
    }))
      events.push(e);
    expect(events).toContainEqual({
      type: 'text-delta',
      text: result.responseText,
    });
    expect(events.at(-1)).toEqual({ type: 'state', state: 'completed' });
    expect((await loadCurrentSummerSession(store))?.turns[0]).toMatchObject({
      assistantText: result.responseText,
      eveReceipt: { eventId, sessionId: 'ses_summer', turnId: 'turn_1' },
    });
    const replay = [];
    for await (const e of runOvieSummerTurn({
      store,
      speaker: createEveSummerSpeaker(fetchShadow),
      userText: input.userText,
      clientTurnId: input.clientTurnId,
      principalHash: input.principalHash,
      receipts: [],
    }))
      replay.push(e);
    expect(replay).toContainEqual({ type: 'state', state: 'recovery' });
    expect(fetchShadow).toHaveBeenCalledTimes(2);
  });
  it('pins continuation to the prior receipt and does not reimport history', async () => {
    await collect({
      ...input,
      previousEveEventId: 'previous',
      previousEveSessionId: 'ses_summer',
      history: [{ role: 'user', text: 'older' }],
    });
    const posted = JSON.parse(
      String(fetchShadow.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>;
    expect(posted).toMatchObject({
      previousEventId: 'previous',
      principalHash: input.principalHash,
      deploymentId: 'dpl_test',
      history: [],
    });
    expect(posted).not.toHaveProperty('canonicalTailRecovery');
    expect(fetchShadow.mock.calls[0]?.[1]?.headers).toBeUndefined();
    expect(fetchShadow.mock.calls[1]?.[1]?.headers).toMatchObject({
      'x-jovie-summer-principal-hash': input.principalHash,
      'x-jovie-summer-deployment-id': 'dpl_test',
    });
  });
  it('bounds the one-time legacy history import to Eve ingress limits', async () => {
    await collect({
      ...input,
      canonicalTailRecovery: true,
      history: Array.from({ length: 220 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        text: `legacy-${index}-${'x'.repeat(500)}`,
      })),
    });
    const posted = JSON.parse(String(fetchShadow.mock.calls[0]?.[1]?.body)) as {
      canonicalTailRecovery?: boolean;
      history: { text: string }[];
    };
    expect(posted.canonicalTailRecovery).toBe(true);
    expect(posted.history.length).toBeLessThanOrEqual(200);
    expect(
      new TextEncoder().encode(JSON.stringify(posted.history)).byteLength
    ).toBeLessThanOrEqual(20 * 1024);
    expect(posted.history.at(-1)?.text).toContain('legacy-219-');
  });
  it('recovers a failed no-receipt product turn through the actual private ingress without losing local history', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_test');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'a'.repeat(40));
    const records = new Map<string, ShadowRecord>();
    const privateStore = {
      read: vi.fn(async (path: string) => records.get(path) ?? null),
      persist: vi.fn(
        async (
          path: string,
          record: ShadowRecord
        ): Promise<'created' | 'exists'> => {
          if (records.has(path)) return 'exists';
          records.set(path, record);
          return 'created';
        }
      ),
    };
    const dispatch = vi.fn(
      async (
        _input: ConversationInput,
        _message: string,
        _sessionId: string | null
      ) => 'ses_summer'
    );
    const ingress = createConversationIngress({
      ...privateStore,
      authenticate: async () => ({ subject: 'jovie-production' }),
      verifyPrincipal: () => true,
      verifyDeployment: () => true,
      enabled: () => true,
      now: () => new Date('2026-09-05T03:00:00Z'),
      dispatch,
    });
    const canonical: ConversationInput = {
      eventId: `sum_${'9'.repeat(24)}`,
      conversationId: 'summer-session-current',
      previousEventId: null,
      principalHash: input.principalHash!,
      deploymentId: 'dpl_test',
      message: 'Earlier canonical turn',
      history: [],
    };
    const postCanonical = await ingress(
      new Request('https://eve.test/conversation', {
        method: 'POST',
        body: JSON.stringify(canonical),
      })
    );
    expect(postCanonical.status).toBe(202);
    const privateEvent = (type: string, data: Record<string, unknown>) =>
      `${JSON.stringify({ type, data })}\n`;
    const privateStream = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    expect(
      (
        await readConversationResult({
          store: privateStore,
          eventId: canonical.eventId,
          principalHash: canonical.principalHash,
          deploymentId: canonical.deploymentId,
          stream: async () =>
            privateStream(
              privateEvent('message.received', {
                message: renderConversation(canonical),
                turnId: 'turn_canonical',
              }) +
                privateEvent('message.completed', {
                  message: 'Canonical answer',
                  finishReason: 'stop',
                  turnId: 'turn_canonical',
                }) +
                privateEvent('turn.completed', {
                  turnId: 'turn_canonical',
                })
            ),
        })
      ).status
    ).toBe(200);

    const productStore = new MemoryOperatingStore();
    const failedSpeaker: SummerSpeaker = {
      id: 'summer',
      runtime: 'eve',
      async *speak() {
        throw new Error('failed before an Eve receipt');
      },
    };
    const failedEvents = [];
    for await (const event of runOvieSummerTurn({
      store: productStore,
      speaker: failedSpeaker,
      userText: 'Preserve this failed local turn',
      clientTurnId: 'failed-client-turn',
      principalHash: input.principalHash,
      receipts: [],
    })) {
      failedEvents.push(event);
    }
    expect(failedEvents.at(-1)).toEqual({ type: 'state', state: 'failure' });
    const failedTurn = (await loadCurrentSummerSession(productStore))?.turns[0];
    expect(failedTurn).toMatchObject({
      clientTurnId: 'failed-client-turn',
      assistantText: '',
      state: 'failure',
    });
    expect(failedTurn).not.toHaveProperty('eveReceipt');
    const adapterFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return ingress(
          new Request(`https://eve.test${path}`, {
            method: 'POST',
            body: init.body,
          })
        );
      }
      const recoveredEventId = path.split('/').at(-2)!;
      const admittedInput = dispatch.mock.calls.at(
        -1
      )?.[0] as ConversationInput;
      return readConversationResult({
        store: privateStore,
        eventId: recoveredEventId,
        principalHash: input.principalHash!,
        deploymentId: 'dpl_test',
        stream: async () =>
          privateStream(
            privateEvent('message.received', {
              message: renderConversation(admittedInput),
              turnId: 'turn_recovered',
            }) +
              privateEvent('message.completed', {
                message: 'Recovered through canonical Eve.',
                finishReason: 'stop',
                turnId: 'turn_recovered',
              }) +
              privateEvent('turn.completed', { turnId: 'turn_recovered' })
          ),
      });
    });
    const events = [];
    for await (const event of runOvieSummerTurn({
      store: productStore,
      speaker: createEveSummerSpeaker(adapterFetch),
      userText: 'Continue safely',
      clientTurnId: 'recovery-client-turn',
      principalHash: input.principalHash,
      receipts: [],
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'text-delta',
      text: 'Recovered through canonical Eve.',
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1]?.[0]).toMatchObject({
      canonicalTailRecovery: true,
      history: [],
    });
    expect(dispatch.mock.calls[1]?.[1]).not.toContain(
      'Preserve this failed local turn'
    );
    expect(dispatch.mock.calls[1]?.[2]).toBe('ses_summer');
    const session = await loadCurrentSummerSession(productStore);
    expect(session?.turns).toHaveLength(2);
    expect(session?.turns[0]).toMatchObject({
      clientTurnId: 'failed-client-turn',
      state: 'failure',
    });
    expect(session?.turns[1]).toMatchObject({
      clientTurnId: 'recovery-client-turn',
      assistantText: 'Recovered through canonical Eve.',
    });
  });
  it('fails closed while reading an oversized chunked Eve response', async () => {
    fetchShadow.mockReset().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('x'.repeat(129 * 1024))
            );
            controller.close();
          },
        }),
        { headers: { 'x-jovie-eve-deployment-id': 'dpl_test' } }
      )
    );
    expect(await collect()).toEqual([{ type: 'error', state: 'unknown' }]);
    expect(fetchShadow).toHaveBeenCalledOnce();
  });
  it('rejects an unconfigured or mismatched Eve deployment identity', async () => {
    vi.stubEnv('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID', 'dpl_expected');
    expect(await collect()).toEqual([{ type: 'error', state: 'unknown' }]);
    expect(fetchShadow).toHaveBeenCalledOnce();

    fetchShadow.mockReset().mockResolvedValueOnce(
      new Response('{}', {
        headers: { 'x-jovie-eve-deployment-id': 'dpl_expected' },
      })
    );
    vi.stubEnv('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID', '');
    expect(await collect()).toEqual([{ type: 'error', state: 'unknown' }]);
  });
  it('fails closed on wrong event, principal, deployment, session, model, or malformed terminal response', async () => {
    for (const bad of [
      { ...result, eventId: 'wrong' },
      { ...result, principalHash: 'b'.repeat(43) },
      { ...result, deploymentId: 'dpl_other' },
      { ...result, deploymentId: undefined },
      { ...result, sessionId: 'ses_wrong' },
      { ...result, model: 'openai/gpt-5.6' },
      {},
    ]) {
      fetchShadow
        .mockReset()
        .mockResolvedValueOnce(eveResponse({ ok: true }))
        .mockResolvedValueOnce(eveResponse({ result: bad }));
      const events = await collect({
        ...input,
        previousEveSessionId: 'ses_summer',
      });
      expect(events).toEqual([{ type: 'error', state: 'unknown' }]);
    }
  });
  it('surfaces budget exhaustion with reset time and never invokes another provider', async () => {
    fetchShadow.mockReset().mockResolvedValueOnce(
      eveResponse(
        {
          code: 'daily_turn_budget_exhausted',
          resetAt: '2026-09-06T00:00:00Z',
          checkpoint: {
            eventId,
            conversationId: 'summer-session-current',
            principalHash: input.principalHash,
            deploymentId: 'dpl_test',
            sessionId: null,
            nextStartIndex: 0,
            status: 'rejected_budget',
          },
        },
        { status: 429 }
      )
    );
    expect(await collect()).toEqual([
      {
        type: 'checkpoint',
        checkpoint: {
          eventId,
          conversationId: 'summer-session-current',
          principalHash: input.principalHash,
          deploymentId: 'dpl_test',
          sessionId: null,
          nextStartIndex: 0,
          status: 'rejected_budget',
        },
      },
      {
        type: 'notice',
        text: "Summer's daily conversation allowance is used up. It resets at 2026-09-06T00:00:00Z.",
        code: 'daily_turn_budget_exhausted',
      },
      { type: 'error', state: 'unavailable' },
    ]);
    expect(fetchShadow).toHaveBeenCalledOnce();
  });
  it('rejects budget checkpoints from another principal or deployment', async () => {
    for (const binding of [
      { principalHash: 'b'.repeat(43), deploymentId: 'dpl_test' },
      { principalHash: input.principalHash, deploymentId: 'dpl_other' },
    ]) {
      fetchShadow.mockReset().mockResolvedValueOnce(
        eveResponse(
          {
            code: 'daily_turn_budget_exhausted',
            resetAt: '2026-09-06T00:00:00Z',
            checkpoint: {
              eventId,
              conversationId: 'summer-session-current',
              ...binding,
              sessionId: null,
              nextStartIndex: 0,
              status: 'rejected_budget',
            },
          },
          { status: 429 }
        )
      );
      expect(await collect()).toEqual([{ type: 'error', state: 'unknown' }]);
      expect(fetchShadow).toHaveBeenCalledOnce();
    }
  });
  it('keeps failed and uncertain results explicit', async () => {
    fetchShadow
      .mockReset()
      .mockResolvedValueOnce(eveResponse({ ok: true }))
      .mockResolvedValueOnce(
        eveResponse({
          result: { ...result, status: 'failed', responseText: '' },
        })
      );
    expect((await collect()).at(-1)).toEqual({
      type: 'error',
      state: 'failure',
    });
    fetchShadow.mockReset().mockRejectedValue(new Error('timeout'));
    expect(await collect()).toEqual([{ type: 'error', state: 'unknown' }]);
  });
  it('reconciles an uncertain POST through the durable result endpoint without redispatch', async () => {
    fetchShadow
      .mockReset()
      .mockResolvedValueOnce(
        eveResponse(
          { code: 'conversation_persistence_or_dispatch_unknown' },
          { status: 503 }
        )
      )
      .mockResolvedValueOnce(eveResponse({ result }));
    expect(await collect()).toContainEqual({
      type: 'text-delta',
      text: result.responseText,
    });
    expect(fetchShadow).toHaveBeenCalledTimes(2);
  });
  it('renders an explicit pending receipt when the exact Eve marker is not visible yet', async () => {
    fetchShadow
      .mockReset()
      .mockResolvedValueOnce(
        eveResponse({ code: 'dispatch_unknown' }, { status: 503 })
      )
      .mockResolvedValueOnce(
        eveResponse({ code: 'turn_pending', eventId }, { status: 503 })
      );
    expect(await collect()).toEqual([
      {
        type: 'notice',
        text: 'Summer is still reconciling this turn. Your message will not be sent again; reopen this conversation to check for the exact Eve result.',
        code: 'summer_turn_pending',
      },
      { type: 'error', state: 'unknown' },
    ]);
    expect(fetchShadow).toHaveBeenCalledTimes(2);
  });
  it('imports prior Mac history once without forking or discarding turns', async () => {
    const store = new MemoryOperatingStore();
    const session = await openCurrentSummerSession(store);
    const turn = {
      turnIndex: 1,
      clientTurnId: 'old',
      userText: 'Remember the launch',
      assistantText: 'Recorded',
      state: 'completed',
      eveWorkId: null,
      eveAcks: [],
      correlationId: 'old',
      toolReceipt: null,
      createdAt: new Date().toISOString(),
    };
    await store.putDecision({
      id: SUMMER_SESSION_DECISION_ID,
      kind: 'decision',
      decided: JSON.stringify({
        identity: { ...session.identity, runtime: 'mac' },
        turns: [turn],
      }),
      why: 'history',
      provenance: 'summer-session',
      createdAt: new Date().toISOString(),
    });
    const migrated = await openCurrentSummerSession(store);
    expect(migrated.identity).toMatchObject({
      runtime: 'eve',
      sessionId: CURRENT_SUMMER_SESSION_ID,
    });
    expect(migrated.turns).toEqual([turn]);
    expect(
      JSON.parse(
        (await store.getDecision(SUMMER_SESSION_DECISION_ID))?.decided ?? '{}'
      ).turns
    ).toEqual([turn]);
  });
  it('fails closed when canonical stored history is corrupt or migration cannot persist', async () => {
    const store = new MemoryOperatingStore();
    await store.putDecision({
      id: SUMMER_SESSION_DECISION_ID,
      kind: 'decision',
      decided: '{bad',
      why: 'history',
      provenance: 'summer-session',
      createdAt: new Date().toISOString(),
    });
    await expect(openCurrentSummerSession(store)).rejects.toThrow();
    expect((await store.getDecision(SUMMER_SESSION_DECISION_ID))?.decided).toBe(
      '{bad'
    );
  });
});
