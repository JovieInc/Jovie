import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DurableOperatingStore,
  memoryRecordBackend,
} from '@/lib/ovie/mcp/store';
import {
  claimOvieSummerTurn,
  completeOvieSummerTurn,
  enqueueOvieSummerTurn,
  OvieSummerTurnError,
} from '@/lib/ovie/summer-conversation';
import { respondToOvieSummerAction } from '@/lib/ovie/summer-http';
import { createCurrentSummerQueueSpeaker } from '@/lib/ovie/summer-queue-speaker';
import { resetSummerTransportRuntime } from '@/lib/ovie/summer-transport';

const founder = {
  authenticated: true,
  isAdmin: true,
  scopes: ['ovie:read', 'ovie:write'],
} as const;

describe('Ovie Summer conversation handoff', () => {
  afterEach(() => {
    resetSummerTransportRuntime();
  });

  it('binds Eve work, recovers expired claims, and streams fenced Mac completion', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await enqueueOvieSummerTurn(store, {
      id: 'turn_live',
      userText: 'What should we ship first?',
      receipts: [
        {
          text: 'x',
          lane: 'heavy',
          destination: 'kanban',
          ack: 'stored',
          destinationHandle: null,
          workerSpawned: false,
          workId: 'ini_work_1',
        },
      ],
    });
    await expect(
      enqueueOvieSummerTurn(store, { id: 'turn_live', userText: 'Different' })
    ).rejects.toBeInstanceOf(OvieSummerTurnError);
    expect((await store.getSummerTurn('turn_live'))?.eveWorkId).toBe(
      'ini_work_1'
    );
    await claimOvieSummerTurn(store, {
      id: 'turn_live',
      workerId: 'old-mac',
      claimToken: 'old-claim',
      now: new Date(Date.now() - 5_000),
      ttlSeconds: 1,
    });
    const post = (body: Record<string, unknown>) =>
      respondToOvieSummerAction({ principal: founder, store, body });
    const claim = await post({
      action: 'claim',
      id: 'turn_live',
      worker_id: 'summer-mac',
    });
    const token = ((await claim.json()) as { turn: { claim_token: string } })
      .turn.claim_token;
    expect(
      (
        await post({
          action: 'complete',
          id: 'turn_live',
          claim_token: 'old-claim',
          response_text: 'Stale Summer answer',
        })
      ).status
    ).toBe(409);
    const events: unknown[] = [];
    const pending = (async () => {
      for await (const event of createCurrentSummerQueueSpeaker(store).speak({
        userText: 'What should we ship first?',
        clientTurnId: 'replay-live',
        history: [],
      })) {
        events.push(event);
      }
    })();
    await vi.waitFor(async () => {
      expect((await store.listSummerTurns()).length).toBeGreaterThan(1);
    });
    await completeOvieSummerTurn(store, {
      id: 'turn_live',
      claimToken: token,
      responseText: 'Current Summer via the Mac lander.',
      tool: {
        name: 'get_org_state',
        ok: true,
        receiptId: 'tool_ok_1',
        summary: 'org',
      },
    });
    const queued = (await store.listSummerTurns()).find(
      row => row.state === 'queued'
    );
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
    await pending;
    expect(events).toEqual([
      {
        type: 'text-delta',
        text: 'Current Summer completed through the Mac bridge.',
      },
    ]);
    await expect(store.getSummerTurn('turn_live')).resolves.toMatchObject({
      tool: { receiptId: 'tool_ok_1' },
    });
  });
});
