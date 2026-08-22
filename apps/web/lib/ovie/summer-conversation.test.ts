import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DurableOperatingStore,
  memoryRecordBackend,
} from '@/lib/ovie/mcp/store';
import {
  claimOvieSummerTurn,
  completeOvieSummerTurn,
  enqueueOvieSummerTurn,
  OvieSummerTurnConflictError,
  ovieSummerTurnId,
  waitForOvieSummerTurn,
} from '@/lib/ovie/summer-conversation';
import {
  respondToOvieSummerAction,
  respondToOvieSummerPending,
} from '@/lib/ovie/summer-http';
import {
  bindCurrentSummerQueueSpeaker,
  createCurrentSummerQueueSpeaker,
} from '@/lib/ovie/summer-queue-speaker';
import {
  getBoundSummerSpeaker,
  resetSummerTransportRuntime,
} from '@/lib/ovie/summer-transport';

describe('Ovie Summer conversation handoff', () => {
  afterEach(() => resetSummerTransportRuntime());

  it('deduplicates browser retries and rejects payload drift', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    const id = ovieSummerTurnId({
      conversationId: 'summer-session:current',
      clientTurnId: 'client_turn_01',
    });
    const input = {
      id,
      conversationId: 'summer-session:current',
      userText: 'What should we ship first?',
    };
    const first = await enqueueOvieSummerTurn(store, input);
    await expect(enqueueOvieSummerTurn(store, input)).resolves.toEqual(first);
    await expect(
      enqueueOvieSummerTurn(store, { ...input, userText: 'Different payload' })
    ).rejects.toBeInstanceOf(OvieSummerTurnConflictError);
  });

  it('waits for the fenced completion without losing continuity', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await enqueueOvieSummerTurn(store, {
      id: 'turn_wait',
      conversationId: 'summer-session:current',
      userText: 'Continue the founder conversation.',
    });
    await claimOvieSummerTurn(store, {
      id: 'turn_wait',
      workerId: 'summer-mac',
      claimToken: 'claim_wait',
    });
    const completed = await waitForOvieSummerTurn(store, {
      id: 'turn_wait',
      timeoutMs: 100,
      sleep: async () => {
        await completeOvieSummerTurn(store, {
          id: 'turn_wait',
          claimToken: 'claim_wait',
          responseText: 'I remember the previous turn.',
        });
      },
    });
    expect(completed).toMatchObject({
      conversationId: 'summer-session:current',
      state: 'completed',
      responseText: 'I remember the previous turn.',
    });
  });

  it('founder-gates pending, claim, and durable completion', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await enqueueOvieSummerTurn(store, {
      id: 'turn_http',
      conversationId: 'summer-session:current',
      userText: 'What is the current bottleneck?',
    });
    expect(
      (
        await respondToOvieSummerPending({
          principal: { authenticated: false, isAdmin: false, scopes: [] },
          store,
        })
      ).status
    ).toBe(401);
    expect(
      (
        await respondToOvieSummerAction({
          principal: {
            authenticated: true,
            isAdmin: true,
            scopes: ['ovie:read'],
          },
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
    const claim = await respondToOvieSummerAction({
      principal: founder,
      store,
      body: { action: 'claim', id: 'turn_http', worker_id: 'summer-mac' },
    });
    const claimBody = (await claim.json()) as {
      turn: { claim_token: string };
    };
    expect(
      (
        await respondToOvieSummerAction({
          principal: founder,
          store,
          body: {
            action: 'complete',
            id: 'turn_http',
            claim_token: claimBody.turn.claim_token,
            response_text: 'The authenticated bridge is the bottleneck.',
          },
        })
      ).status
    ).toBe(200);
    await expect(store.getSummerTurn('turn_http')).resolves.toMatchObject({
      state: 'completed',
      responseText: 'The authenticated bridge is the bottleneck.',
    });
  });

  it('binds the production queue speaker through fenced Mac completion', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    const bound = bindCurrentSummerQueueSpeaker(store);
    expect(getBoundSummerSpeaker()).toBe(bound);
    const speaker = createCurrentSummerQueueSpeaker(store);
    const eventsPromise = (async () => {
      const events = [];
      for await (const event of speaker.speak({
        userText: 'Continue through the authenticated Mac runtime.',
        conversationId: 'summer-session:current',
        clientTurnId: 'founder-live-turn',
        history: [],
      })) {
        events.push(event);
      }
      return events;
    })();
    await vi.waitFor(async () => {
      expect(await store.listSummerTurns()).toHaveLength(1);
    });
    const [queued] = await store.listSummerTurns();
    await claimOvieSummerTurn(store, {
      id: queued?.id ?? '',
      workerId: 'summer-mac',
      claimToken: 'queue-claim',
    });
    await completeOvieSummerTurn(store, {
      id: queued?.id ?? '',
      claimToken: 'queue-claim',
      responseText: 'Current Summer completed through the Mac bridge.',
    });
    await expect(eventsPromise).resolves.toEqual([
      {
        type: 'text-delta',
        text: 'Current Summer completed through the Mac bridge.',
      },
    ]);
  });
});
