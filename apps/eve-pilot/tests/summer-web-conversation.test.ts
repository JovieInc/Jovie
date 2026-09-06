import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ShadowRecord } from '../agent/lib/summer-shadow-ingress';
import {
  type ConversationInput,
  conversationPath,
  createConversationIngress,
  readConversationResult,
  renderConversation,
  verifyFounderPrincipal,
} from '../agent/lib/summer-web-conversation';

const id = (n: number) => `sum_${String(n).padStart(24, '0')}`;
const input = (n = 1): ConversationInput => ({
  eventId: id(n),
  conversationId: 'summer-session-current',
  previousEventId: null,
  principalHash: 'a'.repeat(43),
  deploymentId: 'dpl_test',
  message: 'Are you Summer?',
  history: [],
});
function fixture() {
  const records = new Map<string, ShadowRecord>();
  const store = {
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
  const dispatch = vi.fn(async () => 'ses_summer');
  const deps = {
    ...store,
    dispatch,
    authenticate: vi.fn(async () => ({ subject: 'jovie-production' })),
    verifyPrincipal: vi.fn(() => true),
    verifyDeployment: vi.fn(() => true),
    enabled: () => true,
    now: () => new Date('2026-09-05T03:00:00Z'),
  };
  const send = (value: unknown, handler = createConversationIngress(deps)) =>
    (() => {
      const body = JSON.stringify(value);
      return handler(
        new Request('https://eve.test/conversation', {
          method: 'POST',
          body,
        })
      );
    })();
  return { records, store, deps, dispatch, send };
}
const event = (type: string, data: Record<string, unknown>) =>
  JSON.stringify({ type, data }) + '\n';
function events(
  value: ConversationInput,
  answer = 'I am Summer Jovi — AI Agent.',
  turnId = 'turn_1'
) {
  return (
    event('message.received', { message: renderConversation(value), turnId }) +
    event('message.completed', {
      message: answer,
      finishReason: 'stop',
      turnId,
    }) +
    event('turn.completed', { turnId })
  );
}
function stream(text: string) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

describe('authenticated persistent Summer conversation', () => {
  it('requires the fixed founder principal and rejects malformed values', () => {
    expect(
      verifyFounderPrincipal(input().principalHash, {
        SUMMER_CONVERSATION_FOUNDER_PRINCIPAL_HASH: input().principalHash,
      })
    ).toBe(true);
    expect(verifyFounderPrincipal(input().principalHash, {})).toBe(false);
    expect(
      verifyFounderPrincipal('short', {
        SUMMER_CONVERSATION_FOUNDER_PRINCIPAL_HASH: input().principalHash,
      })
    ).toBe(false);
  });
  it('rejects auth before parsing and disables admission without dispatch', async () => {
    const f = fixture();
    const denied = createConversationIngress({
      ...f.deps,
      authenticate: async () => new Response(null, { status: 401 }),
    });
    expect((await f.send(input(), denied)).status).toBe(401);
    expect(
      (
        await f.send(
          input(),
          createConversationIngress({ ...f.deps, enabled: () => false })
        )
      ).status
    ).toBe(503);
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.store.persist).not.toHaveBeenCalled();
  });
  it('rejects principal or deployment drift before durable admission', async () => {
    const f = fixture();
    const wrongPrincipal = createConversationIngress({
      ...f.deps,
      verifyPrincipal: () => false,
    });
    expect((await f.send(input(), wrongPrincipal)).status).toBe(403);
    const wrongDeployment = createConversationIngress({
      ...f.deps,
      verifyDeployment: () => false,
    });
    expect((await f.send(input(), wrongDeployment)).status).toBe(403);
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.store.persist).not.toHaveBeenCalled();
  });
  it('admits once, returns durable acceptance on retry, rejects conflicting content', async () => {
    const f = fixture();
    const admitted = await f.send(input());
    expect(admitted.status).toBe(202);
    expect(admitted.headers.get('x-jovie-eve-deployment-id')).toBe('local');
    expect(admitted.headers.get('x-jovie-eve-commit-sha')).toBe('local');
    expect((await f.send(input())).status).toBe(200);
    expect((await f.send({ ...input(), message: 'Changed' })).status).toBe(409);
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(f.records.get(conversationPath('accepted', id(1)))).toMatchObject({
      model: 'zai/glm-5.3-flash',
      sessionId: 'ses_summer',
      dailySlot: 1,
    });
    const durableIntent = f.records.get(conversationPath('intents', id(1)));
    expect(durableIntent).toMatchObject({
      eventId: id(1),
      principalHash: input().principalHash,
    });
    expect(JSON.stringify(durableIntent)).not.toContain('Are you Summer?');
    expect(durableIntent?.bodySHA256).toBe(
      createHash('sha256').update(JSON.stringify(input())).digest('hex')
    );
    expect(JSON.stringify(await (await f.send(input())).json())).not.toContain(
      String(durableIntent?.bodySHA256)
    );
  });
  it('never redispatches an ambiguous admission', async () => {
    const f = fixture();
    f.dispatch.mockRejectedValueOnce(new Error('network'));
    expect((await f.send(input())).status).toBe(503);
    const retry = await f.send(input());
    expect(retry.status).toBe(503);
    expect(await retry.json()).toMatchObject({ code: 'dispatch_unknown' });
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it('enforces one immutable successor, even across concurrent submissions', async () => {
    const f = fixture();
    const responses = await Promise.all([f.send(input(1)), f.send(input(2))]);
    expect(responses.map(r => r.status).sort()).toEqual([202, 409]);
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(
      [...f.records.keys()].filter(path => path.includes('/budgets/daily/'))
    ).toHaveLength(1);
    const admittedEventIds = [...f.records.entries()]
      .filter(([path]) => path.includes('/budgets/daily/'))
      .map(([, record]) => record.eventId);
    const winningIndex = responses.findIndex(
      response => response.status === 202
    );
    expect(admittedEventIds).toEqual([id(winningIndex + 1)]);
    const busyIndex = responses.findIndex(response => response.status === 409);
    expect((await f.send(input(busyIndex + 1))).status).toBe(409);
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it('recovers an empty product session from the verified canonical Eve tail', async () => {
    const f = fixture();
    expect((await f.send(input(1))).status).toBe(202);
    await readConversationResult({
      store: f.store,
      eventId: id(1),
      principalHash: input().principalHash,
      deploymentId: input().deploymentId,
      stream: async () => stream(events(input(1))),
    });

    const recoveredInput = { ...input(2), deploymentId: 'dpl_next' };
    expect((await f.send(recoveredInput)).status).toBe(202);
    expect(f.dispatch).toHaveBeenCalledTimes(2);
    expect(f.dispatch.mock.calls[1]?.[2]).toBe('ses_summer');
    expect(f.records.get(conversationPath('intents', id(2)))).toMatchObject({
      previousEventId: id(1),
    });
    expect(f.records.get(conversationPath('successors', id(1)))).toEqual({
      eventId: id(2),
    });

    expect((await f.send(recoveredInput)).status).toBe(200);
    expect(f.dispatch).toHaveBeenCalledTimes(2);

    await readConversationResult({
      store: f.store,
      eventId: id(2),
      principalHash: input().principalHash,
      deploymentId: recoveredInput.deploymentId,
      stream: async () =>
        stream(events(recoveredInput, 'Second answer', 'turn_2')),
    });
    expect(
      (await f.send({ ...input(3), deploymentId: recoveredInput.deploymentId }))
        .status
    ).toBe(202);
    expect(f.dispatch).toHaveBeenCalledTimes(3);
    expect(f.dispatch.mock.calls[2]?.[2]).toBe('ses_summer');
    expect(f.records.get(conversationPath('intents', id(3)))).toMatchObject({
      previousEventId: id(2),
    });
  });
  it('recovers through the canonical tail when failed local history has no Eve receipt', async () => {
    const f = fixture();
    expect((await f.send(input(1))).status).toBe(202);
    await readConversationResult({
      store: f.store,
      eventId: id(1),
      principalHash: input().principalHash,
      deploymentId: input().deploymentId,
      stream: async () => stream(events(input(1))),
    });
    const staleLocalText = 'failed local turn must not become Eve context';
    const recoveredInput: ConversationInput = {
      ...input(2),
      deploymentId: 'dpl_next',
      canonicalTailRecovery: true,
      history: [
        { role: 'user', text: staleLocalText },
        { role: 'assistant', text: '' },
      ],
    };
    expect((await f.send(recoveredInput)).status).toBe(202);
    expect(f.dispatch).toHaveBeenCalledTimes(2);
    expect(f.dispatch.mock.calls[1]?.[0]).toMatchObject({
      history: [],
      canonicalTailRecovery: true,
    });
    expect(f.dispatch.mock.calls[1]?.[1]).not.toContain(staleLocalText);
    expect(f.dispatch.mock.calls[1]?.[2]).toBe('ses_summer');
    expect((await f.send(recoveredInput)).status).toBe(200);
    expect(f.dispatch).toHaveBeenCalledTimes(2);
  });
  it('never dispatches unverified local history when no canonical tail exists', async () => {
    const f = fixture();
    const staleLocalText = 'unverified local turn must not become Eve context';
    const recoveredInput: ConversationInput = {
      ...input(1),
      canonicalTailRecovery: true,
      history: [{ role: 'user', text: staleLocalText }],
    };

    expect((await f.send(recoveredInput)).status).toBe(202);
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(f.dispatch.mock.calls[0]?.[0]).toMatchObject({
      eventId: id(1),
      history: [],
      canonicalTailRecovery: true,
    });
    expect(f.dispatch.mock.calls[0]?.[1]).not.toContain(staleLocalText);
    expect(f.dispatch.mock.calls[0]?.[2]).toBeNull();
  });
  it('fails closed when canonical-tail recovery is pending or crosses a binding', async () => {
    const pending = fixture();
    expect((await pending.send(input(1))).status).toBe(202);
    const recoveryHistory = [
      { role: 'user' as const, text: 'local failed turn' },
      { role: 'assistant' as const, text: '' },
    ];
    const pendingResponse = await pending.send({
      ...input(2),
      canonicalTailRecovery: true,
      history: recoveryHistory,
    });
    expect(pendingResponse.status).toBe(409);
    expect(await pendingResponse.json()).toMatchObject({
      code: 'conversation_busy',
    });
    expect(pending.dispatch).toHaveBeenCalledOnce();

    const mismatched = fixture();
    mismatched.records.set(conversationPath('successors', 'root'), {
      eventId: id(1),
    });
    mismatched.records.set(conversationPath('results', id(1)), {
      eventId: id(1),
      conversationId: input().conversationId,
      principalHash: 'b'.repeat(43),
      deploymentId: input().deploymentId,
      sessionId: 'ses_other',
      startIndex: 0,
      model: 'zai/glm-5.3-flash',
      dailySlot: 1,
      utcDay: '2026-09-05',
      turnId: 'turn_other',
      responseText: 'Other principal response',
      status: 'completed',
      nextStartIndex: 3,
    });
    const mismatchedResponse = await mismatched.send({
      ...input(2),
      canonicalTailRecovery: true,
      history: recoveryHistory,
    });
    expect(mismatchedResponse.status).toBe(409);
    expect(await mismatchedResponse.json()).toMatchObject({
      code: 'canonical_binding_conflict',
    });
    expect(mismatched.dispatch).not.toHaveBeenCalled();
  });
  it('fails closed on malformed canonical recovery and rejects mixed predecessor recovery', async () => {
    const malformed = fixture();
    malformed.records.set(conversationPath('successors', 'root'), {
      eventId: 'malformed',
    });
    const malformedResponse = await malformed.send({
      ...input(2),
      canonicalTailRecovery: true,
      history: [{ role: 'user', text: 'preserved local turn' }],
    });
    expect(malformedResponse.status).toBe(503);
    expect(await malformedResponse.json()).toMatchObject({
      code: 'canonical_tail_unavailable',
    });
    expect(malformed.dispatch).not.toHaveBeenCalled();

    const mixed = fixture();
    const mixedResponse = await mixed.send({
      ...input(2),
      previousEventId: id(1),
      canonicalTailRecovery: true,
    });
    expect(mixedResponse.status).toBe(422);
    expect(await mixedResponse.json()).toMatchObject({
      code: 'invalid_tail_recovery',
    });
    expect(mixed.dispatch).not.toHaveBeenCalled();
  });
  it('canonicalizes property order and permits only one same-event dispatch', async () => {
    const f = fixture();
    const value = input();
    const responses = await Promise.all([
      f.send(value),
      f.send(Object.fromEntries(Object.entries(value).reverse())),
    ]);
    expect(responses.some(response => response.ok)).toBe(true);
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(
      (await f.send(Object.fromEntries(Object.entries(value).reverse()))).status
    ).toBe(200);
    expect(
      (await f.send({ ...value, history: [{ role: 'user', text: 'changed' }] }))
        .status
    ).toBe(409);
  });
  it('holds an admission written before a send acknowledgement forever, including UTC rollover', async () => {
    const f = fixture();
    const persist = f.deps.persist;
    f.deps.persist = vi.fn(async (path, record) => {
      const result = await persist(path, record);
      if (path.includes('/admissions/'))
        throw new Error('write acknowledgement lost');
      return result;
    });
    expect((await f.send(input())).status).toBe(503);
    f.deps.persist = persist;
    expect((await f.send(input())).status).toBe(503);
    expect(
      (
        await f.send(
          input(),
          createConversationIngress({
            ...f.deps,
            now: () => new Date('2026-09-06T03:00:00Z'),
          })
        )
      ).status
    ).toBe(503);
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('rejects concurrent same-event changed bodies with a conflict and one dispatch', async () => {
    const f = fixture();
    const responses = await Promise.all([
      f.send(input()),
      f.send({ ...input(), message: 'Different' }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([
      202, 409,
    ]);
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it('fails closed on legacy signature-derived intent records', async () => {
    const f = fixture();
    f.records.set(conversationPath('intents', id(1)), {
      digest: 'legacy-signature-hash',
    });
    expect((await f.send(input())).status).toBe(409);
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('continues the canonical session across an immutable deployment rollout', async () => {
    const f = fixture();
    await f.send(input());
    await readConversationResult({
      store: f.store,
      eventId: id(1),
      principalHash: input().principalHash,
      deploymentId: input().deploymentId,
      stream: async () => stream(events(input())),
    });
    const response = await f.send({
      ...input(2),
      previousEventId: id(1),
      deploymentId: 'dpl_other',
    });
    expect(response.status).toBe(202);
    expect(f.dispatch).toHaveBeenCalledTimes(2);
    expect(f.dispatch.mock.calls[1]?.[2]).toBe('ses_summer');
    expect(f.records.get(conversationPath('accepted', id(2)))).toMatchObject({
      deploymentId: 'dpl_other',
    });
  });
  it.each([
    'eventId',
    'principalHash',
    'sessionId',
    'nextStartIndex',
    'status',
  ])('rejects malformed or misbound predecessor %s before dispatch', async field => {
    const f = fixture();
    await f.send(input());
    await readConversationResult({
      store: f.store,
      eventId: id(1),
      principalHash: input().principalHash,
      deploymentId: input().deploymentId,
      stream: async () => stream(events(input())),
    });
    const path = conversationPath('results', id(1));
    f.records.set(path, { ...f.records.get(path), [field]: 'invalid' });
    expect((await f.send({ ...input(2), previousEventId: id(1) })).status).toBe(
      409
    );
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it('shares the commercial UTC budget and exposes its reset without dispatch', async () => {
    const f = fixture();
    for (let n = 1; n <= 25; n++)
      f.records.set(`summer-shadow/budgets/daily/2026-09-05/slot-${n}.json`, {
        eventId: `commercial_${n}`,
      });
    const response = await f.send(input());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      code: 'daily_turn_budget_exhausted',
      limit: 25,
      resetAt: '2026-09-06T00:00:00.000Z',
      checkpoint: {
        eventId: id(1),
        principalHash: input().principalHash,
        status: 'rejected_budget',
      },
    });
    expect((await f.send(input())).status).toBe(429);
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.records.get(conversationPath('rejected', id(1)))).toMatchObject({
      checkpoint: { eventId: id(1), status: 'rejected_budget' },
    });

    const nextDay = createConversationIngress({
      ...f.deps,
      now: () => new Date('2026-09-06T03:00:00Z'),
    });
    expect(
      (await f.send({ ...input(2), previousEventId: id(1) }, nextDay)).status
    ).toBe(202);
    expect(f.dispatch).toHaveBeenCalledOnce();
  });

  it('resumes the fenced winner after a crash before budget reservation', async () => {
    const f = fixture();
    const read = f.deps.read;
    let interrupted = false;
    f.deps.read = vi.fn(async path => {
      if (!interrupted && path.includes('/budgets/daily/')) {
        interrupted = true;
        throw new Error('blob read interrupted');
      }
      return read(path);
    });

    expect((await f.send(input())).status).toBe(503);
    expect(f.dispatch).not.toHaveBeenCalled();
    expect((await f.send(input())).status).toBe(202);
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it('reuses its slot after a crash before admission persistence', async () => {
    const f = fixture();
    const persist = f.deps.persist;
    let interrupted = false;
    f.deps.persist = vi.fn(async (path, record) => {
      if (!interrupted && path.includes('/admissions/')) {
        interrupted = true;
        throw new Error('admission write interrupted');
      }
      return persist(path, record);
    });

    expect((await f.send(input())).status).toBe(503);
    expect(f.dispatch).not.toHaveBeenCalled();
    expect((await f.send(input())).status).toBe(202);
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(
      [...f.records.keys()].filter(path => path.includes('/budgets/daily/'))
    ).toHaveLength(1);
  });
  it('allows only the admission creator to dispatch concurrent same-event recovery', async () => {
    const f = fixture();
    const read = f.deps.read;
    let interrupted = false;
    f.deps.read = vi.fn(async path => {
      if (!interrupted && path.includes('/budgets/daily/')) {
        interrupted = true;
        throw new Error('blob read interrupted');
      }
      return read(path);
    });
    expect((await f.send(input())).status).toBe(503);

    const persist = f.deps.persist;
    let firstAdmissionReady: (() => void) | undefined;
    let admissionCalls = 0;
    f.deps.persist = vi.fn(async (path, record) => {
      if (path.includes('/admissions/')) {
        admissionCalls++;
        if (admissionCalls === 1)
          await new Promise<void>(resolve => {
            firstAdmissionReady = resolve;
          });
        else firstAdmissionReady?.();
      }
      return persist(path, record);
    });

    const responses = await Promise.all([f.send(input()), f.send(input())]);
    expect(responses.map(response => response.status).sort()).toEqual([
      202, 503,
    ]);
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(
      [...f.records.keys()].filter(path => path.includes('/budgets/daily/'))
    ).toHaveLength(1);
  });
  it('continues the same session after five turns and across UTC days', async () => {
    const f = fixture();
    let previous: string | null = null;
    for (let n = 1; n <= 6; n++) {
      const value = { ...input(n), previousEventId: previous };
      expect((await f.send(value)).status).toBe(202);
      await readConversationResult({
        principalHash: input().principalHash,
        deploymentId: input().deploymentId,
        store: f.store,
        eventId: id(n),
        stream: async () => stream(events(value, `Answer ${n}`, `turn_${n}`)),
      });
      previous = id(n);
    }
    const nextDay = createConversationIngress({
      ...f.deps,
      now: () => new Date('2026-09-06T03:00:00Z'),
    });
    expect(
      (await f.send({ ...input(7), previousEventId: previous }, nextDay)).status
    ).toBe(202);
    expect(f.dispatch.mock.calls.at(-1)?.[2]).toBe('ses_summer');
    expect(f.records.get(conversationPath('accepted', id(7)))).toMatchObject({
      sessionId: 'ses_summer',
      dailySlot: 1,
      utcDay: '2026-09-06',
    });
  });
  it('does not reuse a history migration or advance past an unknown predecessor', async () => {
    const f = fixture();
    expect((await f.send({ ...input(), previousEventId: id(9) })).status).toBe(
      409
    );
    expect(
      (
        await f.send({
          ...input(),
          previousEventId: id(9),
          history: [{ role: 'user', text: 'old' }],
        })
      ).status
    ).toBe(422);
    expect((await f.send({ ...input(), conversationId: 'other' })).status).toBe(
      422
    );
    expect(
      (
        await f.send({
          ...input(),
          history: [{ role: 'user', text: 'x'.repeat(33_000) }],
        })
      ).status
    ).toBe(413);
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('fails closed on uncertain budget ownership without reserving a second slot', async () => {
    const f = fixture();
    const persist = f.deps.persist;
    f.deps.persist = vi.fn(async (path, record) =>
      path.includes('/budgets/') ? 'exists' : persist(path, record)
    );
    expect((await f.send(input())).status).toBe(503);
    expect(
      f.deps.persist.mock.calls.filter(([path]) => path.includes('/budgets/'))
    ).toHaveLength(1);
    expect(f.dispatch).not.toHaveBeenCalled();
  });
});

describe('Eve terminal stream receipts', () => {
  it('ignores historical replies and narration, persists only current terminal text, and replays without streaming', async () => {
    const f = fixture();
    await f.send(input());
    const source = vi.fn(async () =>
      stream(
        events(input(9), 'Old answer', 'turn_old') +
          event('message.received', {
            message: renderConversation(input()),
            turnId: 'turn_1',
          }) +
          event('message.completed', {
            message: 'Thinking',
            finishReason: 'tool-calls',
            turnId: 'turn_1',
          }) +
          event('message.completed', {
            message: 'Summer answer',
            finishReason: 'stop',
            turnId: 'turn_1',
          }) +
          event('turn.completed', { turnId: 'turn_1' })
      )
    );
    const response = await readConversationResult({
      principalHash: input().principalHash,
      deploymentId: input().deploymentId,
      store: f.store,
      eventId: id(1),
      stream: source,
    });
    expect(await response.json()).toMatchObject({
      result: {
        eventId: id(1),
        turnId: 'turn_1',
        responseText: 'Summer answer',
        status: 'completed',
        nextStartIndex: 7,
      },
    });
    expect(
      (
        await readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: id(1),
          stream: source,
        })
      ).status
    ).toBe(200);
    expect(source).toHaveBeenCalledOnce();
  });
  it('preserves failure receipt and never presents partial narration as success', async () => {
    const f = fixture();
    await f.send(input());
    const text =
      event('message.received', {
        message: renderConversation(input()),
        turnId: 'turn_1',
      }) +
      event('message.completed', {
        message: 'Partial',
        finishReason: 'stop',
        turnId: 'turn_1',
      }) +
      event('turn.failed', { turnId: 'turn_1' });
    expect(
      await (
        await readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: id(1),
          stream: async () => stream(text),
        })
      ).json()
    ).toMatchObject({ result: { status: 'failed', responseText: '' } });
  });
  it('reconnects unfinished reads from the admitted cursor without a second dispatch', async () => {
    const f = fixture();
    await f.send(input());
    expect(
      (
        await readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: id(1),
          stream: async () =>
            stream(event('turn.started', { turnId: 'turn_1' })),
        })
      ).status
    ).toBe(503);
    expect(f.records.has(conversationPath('results', id(1)))).toBe(false);
    expect(
      (
        await readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: id(1),
          stream: async () => stream(events(input())),
        })
      ).status
    ).toBe(200);
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it('reconciles a post-send crash without redispatch', async () => {
    const f = fixture();
    const persist = f.deps.persist;
    f.deps.persist = vi.fn(async (path, record) => {
      if (path.includes('/accepted/')) throw new Error('post-send crash');
      return persist(path, record);
    });
    expect((await f.send(input())).status).toBe(503);
    expect(f.records.has(conversationPath('accepted', id(1)))).toBe(false);
    expect((await f.send(input())).status).toBe(503);
    expect(f.dispatch).toHaveBeenCalledOnce();
    const recoverSession = vi.fn(async () => 'ses_summer');
    const response = await readConversationResult({
      principalHash: input().principalHash,
      deploymentId: input().deploymentId,
      store: f.store,
      eventId: id(1),
      recoverSession,
      stream: async () => stream(events(input())),
    });
    expect(response.status).toBe(200);
    expect(recoverSession).toHaveBeenCalledWith('summer-session-current');
    expect(f.records.get(conversationPath('accepted', id(1)))).toMatchObject({
      eventId: id(1),
      sessionId: 'ses_summer',
    });
    expect(f.dispatch).toHaveBeenCalledOnce();
  });
  it('does not certify recovery until the exact event marker is visible', async () => {
    const f = fixture();
    await f.send(input());
    f.records.delete(conversationPath('accepted', id(1)));

    const response = await readConversationResult({
      principalHash: input().principalHash,
      deploymentId: input().deploymentId,
      store: f.store,
      eventId: id(1),
      recoverSession: async () => 'ses_summer',
      stream: async () => stream(events(input(9), 'Older answer', 'turn_old')),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'turn_pending' });
    expect(f.records.has(conversationPath('accepted', id(1)))).toBe(false);
  });
  it.each([
    'principalHash',
    'deploymentId',
  ] as const)('rejects %s drift before returning, streaming or recovering private results', async field => {
    const f = fixture();
    await f.send(input());
    const source = vi.fn(async () => stream(events(input())));
    const recoverSession = vi.fn(async () => 'ses_summer');
    const request = {
      store: f.store,
      eventId: id(1),
      principalHash: input().principalHash,
      deploymentId: input().deploymentId,
      stream: source,
      recoverSession,
    };
    const wrong = {
      ...request,
      [field]: field === 'principalHash' ? 'b'.repeat(43) : 'dpl_other',
    };
    expect((await readConversationResult(wrong)).status).toBe(503);
    expect(source).not.toHaveBeenCalled();
    expect(recoverSession).not.toHaveBeenCalled();
    f.records.delete(conversationPath('accepted', id(1)));
    expect((await readConversationResult(wrong)).status).toBe(503);
    expect(recoverSession).not.toHaveBeenCalled();
    expect((await readConversationResult(request)).status).toBe(200);
    source.mockClear();
    expect((await readConversationResult(wrong)).status).toBe(503);
    expect(source).not.toHaveBeenCalled();
    const terminal = f.records.get(conversationPath('results', id(1)))!;
    delete terminal.deploymentId;
    expect((await readConversationResult(request)).status).toBe(503);
  });
  it('cannot return success before durable terminal storage', async () => {
    const f = fixture();
    await f.send(input());
    const store = {
      ...f.store,
      persist: async () => {
        throw new Error('storage');
      },
    };
    await expect(
      readConversationResult({
        principalHash: input().principalHash,
        deploymentId: input().deploymentId,
        store,
        eventId: id(1),
        stream: async () => stream(events(input())),
      })
    ).rejects.toThrow('storage');
  });
  it('fails closed on corrupt immutable acceptance or terminal records', async () => {
    const f = fixture();
    await f.send(input());
    f.records.set(conversationPath('accepted', id(1)), {
      eventId: id(2),
      sessionId: 'ses_wrong',
    });
    expect(
      (
        await readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: id(1),
          stream: async () => stream(events(input())),
        })
      ).status
    ).toBe(503);
    f.records.set(conversationPath('results', id(1)), {
      eventId: id(2),
      status: 'completed',
      responseText: 'wrong turn',
    });
    expect(
      (
        await readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: id(1),
          stream: async () => stream(events(input())),
        })
      ).status
    ).toBe(503);
  });
  it('rejects malformed, oversized, and mismatched-turn streams', async () => {
    const f = fixture();
    await f.send(input());
    for (const text of [
      'invalid\n',
      '{}\n',
      'x'.repeat(600_000),
      event('message.received', {
        message: renderConversation(input()),
        turnId: 'one',
      }) +
        event('message.received', {
          message: renderConversation(input()),
          turnId: 'two',
        }),
    ]) {
      await expect(
        readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: id(1),
          stream: async () => stream(text),
        })
      ).rejects.toThrow();
    }
    expect(
      (
        await readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: 'bad',
          stream: async () => stream(''),
        })
      ).status
    ).toBe(422);
    expect(
      (
        await readConversationResult({
          principalHash: input().principalHash,
          deploymentId: input().deploymentId,
          store: f.store,
          eventId: id(99),
          stream: async () => stream(''),
        })
      ).status
    ).toBe(503);
  });
});
