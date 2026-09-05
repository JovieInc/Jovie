import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ovie/summer-shadow-client', () => ({
  fetchSummerShadow: vi.fn(),
}));

import { MemoryOperatingStore } from './mcp/store';
import { ovieSummerTurnId } from './summer-conversation';
import { createEveSummerSpeaker } from './summer-eve-speaker';
import {
  CURRENT_SUMMER_SESSION_ID,
  loadCurrentSummerSession,
  openCurrentSummerSession,
  SUMMER_SESSION_DECISION_ID,
} from './summer-session';
import { runOvieSummerTurn, type SummerSpeakInput } from './summer-transport';

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
  sessionId: 'ses_summer',
  turnId: 'turn_1',
  responseText: 'Hello Tim, Summer Jovi here.',
  status: 'completed',
  nextStartIndex: 7,
  model: 'zai/glm-5.3-flash',
};
const fetchShadow =
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
const signingPrivateKey = generateKeyPairSync('ed25519').privateKey.export({
  type: 'pkcs8',
  format: 'pem',
});
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
  vi.stubEnv(
    'SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY',
    signingPrivateKey
  );
  vi.stubEnv('SUMMER_BOTTLENECK_PRODUCER_SIGNING_KEY_ID', 'producer-test');
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
    expect(
      JSON.parse(String(fetchShadow.mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      previousEventId: 'previous',
      principalHash: input.principalHash,
      history: [],
    });
    expect(fetchShadow.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-jovie-summer-key-id': 'producer-test',
      'x-jovie-summer-signature': expect.stringMatching(/^ed25519=/u),
    });
  });
  it('bounds the one-time legacy history import to Eve ingress limits', async () => {
    await collect({
      ...input,
      history: Array.from({ length: 220 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        text: `legacy-${index}-${'x'.repeat(500)}`,
      })),
    });
    const posted = JSON.parse(String(fetchShadow.mock.calls[0]?.[1]?.body)) as {
      history: { text: string }[];
    };
    expect(posted.history.length).toBeLessThanOrEqual(200);
    expect(
      new TextEncoder().encode(JSON.stringify(posted.history)).byteLength
    ).toBeLessThanOrEqual(20 * 1024);
    expect(posted.history.at(-1)?.text).toContain('legacy-219-');
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
  it('fails closed on wrong event, session, model, or malformed terminal response', async () => {
    for (const bad of [
      { ...result, eventId: 'wrong' },
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
        },
        { status: 429 }
      )
    );
    expect(await collect()).toEqual([
      {
        type: 'notice',
        text: "Summer's daily conversation allowance is used up. It resets at 2026-09-06T00:00:00Z.",
        code: 'daily_turn_budget_exhausted',
      },
      { type: 'error', state: 'unavailable' },
    ]);
    expect(fetchShadow).toHaveBeenCalledOnce();
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
