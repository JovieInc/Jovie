import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DurableOperatingStore,
  memoryRecordBackend,
} from '@/lib/ovie/mcp/store';
import {
  claimOvieSummerTurn,
  completeOvieSummerTurn,
  enqueueOvieSummerTurn,
  listOvieSummerTurnsForLander,
  OvieSummerTurnClaimError,
  OvieSummerTurnConflictError,
  ovieSummerTurnId,
  waitForOvieSummerTurn,
} from '@/lib/ovie/summer-conversation';
import {
  respondToOvieSummerAction,
  respondToOvieSummerPending,
} from '@/lib/ovie/summer-http';

describe('Ovie Summer conversation store', () => {
  afterEach(() => vi.useRealTimers());
  it('deduplicates browser retries and rejects payload drift', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    const id = ovieSummerTurnId({
      conversationId: 'conversation_01',
      clientTurnId: 'client_turn_01',
    });
    const input = {
      id,
      conversationId: 'conversation_01',
      userText: 'What should we ship first?',
      now: new Date('2026-08-21T23:40:00.000Z'),
    };
    const first = await enqueueOvieSummerTurn(store, input);
    const replay = await enqueueOvieSummerTurn(store, input);
    expect(replay).toEqual(first);
    await expect(
      enqueueOvieSummerTurn(store, { ...input, userText: 'Different payload' })
    ).rejects.toBeInstanceOf(OvieSummerTurnConflictError);
  });

  it('fences completion to the active Mac claim', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await enqueueOvieSummerTurn(store, {
      id: 'turn_fenced',
      conversationId: 'conversation_01',
      userText: 'Give me the current priority.',
      now: new Date('2026-08-21T23:40:00.000Z'),
    });
    const [pending] = await listOvieSummerTurnsForLander(store);
    expect(pending?.id).toBe('turn_fenced');
    await claimOvieSummerTurn(store, {
      id: 'turn_fenced',
      workerId: 'summer-mac',
      claimToken: 'claim_active',
      now: new Date('2026-08-21T23:40:00.000Z'),
    });
    await expect(
      completeOvieSummerTurn(store, {
        id: 'turn_fenced',
        claimToken: 'claim_stale',
        responseText: 'Stale answer',
      })
    ).rejects.toBeInstanceOf(OvieSummerTurnClaimError);
    await expect(
      completeOvieSummerTurn(store, {
        id: 'turn_fenced',
        claimToken: 'claim_active',
        responseText: 'Ship the bridge first.',
        now: new Date('2026-08-21T23:41:00.000Z'),
      })
    ).resolves.toMatchObject({
      state: 'completed',
      responseText: 'Ship the bridge first.',
    });
  });

  it('recovers an expired claim and rejects its stale completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T23:40:00.000Z'));
    const store = new DurableOperatingStore(memoryRecordBackend());
    await enqueueOvieSummerTurn(store, {
      id: 'turn_recovered',
      conversationId: 'conversation_01',
      userText: 'Are you still there?',
    });
    await claimOvieSummerTurn(store, {
      id: 'turn_recovered',
      workerId: 'summer-mac-old',
      claimToken: 'claim_old',
      ttlSeconds: 1,
    });

    await vi.advanceTimersByTimeAsync(1_001);
    const replacement = await claimOvieSummerTurn(store, {
      id: 'turn_recovered',
      workerId: 'summer-mac-new',
      claimToken: 'claim_new',
      ttlSeconds: 120,
    });
    expect(replacement?.claimToken).toBe('claim_new');
    await expect(
      completeOvieSummerTurn(store, {
        id: 'turn_recovered',
        claimToken: 'claim_old',
        responseText: 'Late stale response',
      })
    ).rejects.toBeInstanceOf(OvieSummerTurnClaimError);
    await expect(
      completeOvieSummerTurn(store, {
        id: 'turn_recovered',
        claimToken: 'claim_new',
        responseText: 'Recovered response',
      })
    ).resolves.toMatchObject({
      state: 'completed',
      responseText: 'Recovered response',
    });
  });

  it('waits for the claimed Summer response without losing continuity', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await enqueueOvieSummerTurn(store, {
      id: 'turn_wait',
      conversationId: 'conversation_founder',
      userText: 'Continue the founder conversation.',
    });
    const claimed = await claimOvieSummerTurn(store, {
      id: 'turn_wait',
      workerId: 'summer-mac',
      claimToken: 'claim_wait',
    });
    expect(claimed?.claimToken).toBe('claim_wait');
    const completed = await waitForOvieSummerTurn(store, {
      id: 'turn_wait',
      timeoutMs: 100,
      pollIntervalMs: 25,
      sleep: async () => {
        await completeOvieSummerTurn(store, {
          id: 'turn_wait',
          claimToken: 'claim_wait',
          responseText: 'I remember the previous turn.',
        });
      },
    });
    expect(completed).toMatchObject({
      conversationId: 'conversation_founder',
      state: 'completed',
      responseText: 'I remember the previous turn.',
    });
  });

  it('founder-gates pending, claim, and completion with write scope', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await enqueueOvieSummerTurn(store, {
      id: 'turn_http',
      conversationId: 'conversation_01',
      userText: 'What is the current bottleneck?',
    });
    const unauthenticated = await respondToOvieSummerPending({
      principal: { authenticated: false, isAdmin: false, scopes: [] },
      store,
    });
    expect(unauthenticated.status).toBe(401);
    const readOnly = {
      authenticated: true,
      isAdmin: true,
      scopes: ['ovie:read'],
    } as const;
    expect(
      (
        await respondToOvieSummerAction({
          principal: readOnly,
          store,
          body: { action: 'claim', id: 'turn_http', worker_id: 'summer-mac' },
        })
      ).status
    ).toBe(403);

    const founder = {
      authenticated: true,
      isAdmin: true,
      scopes: ['ovie:read', 'ovie:write'],
    } as const;
    const pending = await respondToOvieSummerPending({
      principal: founder,
      store,
    });
    expect(pending.status).toBe(200);
    expect(await pending.json()).toMatchObject({
      ok: true,
      turns: [
        { id: 'turn_http', user_text: 'What is the current bottleneck?' },
      ],
    });
    const claimResponse = await respondToOvieSummerAction({
      principal: founder,
      store,
      body: { action: 'claim', id: 'turn_http', worker_id: 'summer-mac' },
    });
    expect(claimResponse.status).toBe(200);
    const claimBody = (await claimResponse.json()) as {
      turn: { claim_token: string };
    };
    const completeResponse = await respondToOvieSummerAction({
      principal: founder,
      store,
      body: {
        action: 'complete',
        id: 'turn_http',
        claim_token: claimBody.turn.claim_token,
        response_text: 'The authenticated bridge is the bottleneck.',
      },
    });
    expect(completeResponse.status).toBe(200);
    await expect(store.getSummerTurn('turn_http')).resolves.toMatchObject({
      state: 'completed',
      responseText: 'The authenticated bridge is the bottleneck.',
    });
  });
});
