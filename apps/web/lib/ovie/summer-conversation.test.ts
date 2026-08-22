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
  ovieSummerTurnId,
} from '@/lib/ovie/summer-conversation';
import {
  respondToOvieSummerAction,
  respondToOvieSummerPending,
} from '@/lib/ovie/summer-http';
import { createCurrentSummerQueueSpeaker } from '@/lib/ovie/summer-queue-speaker';
import {
  CURRENT_SUMMER_SESSION_ID,
  loadCurrentSummerSession,
} from '@/lib/ovie/summer-session';
import {
  resetSummerTransportRuntime,
  runOvieSummerTurn,
} from '@/lib/ovie/summer-transport';

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

  it('keeps the Mac lander founder-gated and lists Eve-bound pending turns', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await enqueueOvieSummerTurn(store, {
      id: 'turn_pending',
      userText: 'Status?',
      receipts: [
        {
          text: 'x',
          lane: 'heavy',
          destination: 'kanban',
          ack: 'stored',
          destinationHandle: null,
          workerSpawned: false,
          workId: 'ini_work_pending',
        },
      ],
    });
    const guest = { authenticated: false, isAdmin: false, scopes: [] as const };
    expect(
      (await respondToOvieSummerPending({ principal: guest, store })).status
    ).toBe(401);
    const listed = await respondToOvieSummerPending({
      principal: founder,
      store,
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      ok: true,
      turns: [{ id: 'turn_pending', eve_work_id: 'ini_work_pending' }],
    });
  });

  it('reconnects a canceled stream without losing the later Mac completion', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    const speaker = createCurrentSummerQueueSpeaker(store);
    const abort = new AbortController();
    const first = (async () => {
      const rows: Array<{ type: string; state?: string; text?: string }> = [];
      let text = '';
      for await (const event of runOvieSummerTurn({
        receipts: [
          {
            text: 'x',
            lane: 'heavy',
            destination: 'kanban',
            ack: 'stored',
            destinationHandle: null,
            workerSpawned: false,
            workId: 'ini_work_resume',
          },
        ],
        userText: 'Resume me',
        speaker,
        store,
        signal: abort.signal,
        clientTurnId: 'resume-1',
      })) {
        rows.push(event);
        if (event.type === 'text-delta') text += event.text;
      }
      return { rows, text };
    })();
    await vi.waitFor(async () => {
      expect((await store.listSummerTurns()).length).toBe(1);
    });
    abort.abort();
    const canceled = await first;
    expect(canceled.rows.some(row => row.state === 'canceled')).toBe(true);
    expect(canceled.text).toBe('');
    expect((await loadCurrentSummerSession(store))?.turns ?? []).toHaveLength(
      0
    );

    const queued = (await store.listSummerTurns())[0];
    await claimOvieSummerTurn(store, {
      id: queued?.id ?? '',
      workerId: 'summer-mac',
      claimToken: 'resume-claim',
    });
    await completeOvieSummerTurn(store, {
      id: queued?.id ?? '',
      claimToken: 'resume-claim',
      responseText: 'Recovered Summer after reconnect.',
      tool: {
        name: 'get_org_state',
        ok: true,
        receiptId: 'tool_resume',
        summary: 'org',
      },
    });

    const rows: Array<{ type: string; receipt?: { receiptId: string } }> = [];
    let text = '';
    for await (const event of runOvieSummerTurn({
      receipts: [
        {
          text: 'x',
          lane: 'heavy',
          destination: 'kanban',
          ack: 'stored',
          destinationHandle: null,
          workerSpawned: false,
          workId: 'ini_work_resume',
        },
      ],
      userText: 'Resume me',
      speaker,
      store,
      clientTurnId: 'resume-1',
    })) {
      rows.push(event);
      if (event.type === 'text-delta') text += event.text;
    }
    expect(text).toBe('Recovered Summer after reconnect.');
    expect(rows.some(row => row.receipt?.receiptId === 'tool_resume')).toBe(
      true
    );
    const session = await loadCurrentSummerSession(store);
    expect(session?.turns).toHaveLength(1);
    expect(session?.turns[0]?.eveWorkId).toBe('ini_work_resume');
    expect(session?.identity.memoryNamespace).toBe('summer');
  });

  it('accepts a tool-only Mac completion without founder prose', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    const id = ovieSummerTurnId({
      conversationId: CURRENT_SUMMER_SESSION_ID,
      clientTurnId: 'tool-only',
    });
    await enqueueOvieSummerTurn(store, {
      id,
      conversationId: CURRENT_SUMMER_SESSION_ID,
      userText: 'Org state?',
    });
    await claimOvieSummerTurn(store, {
      id,
      workerId: 'summer-mac',
      claimToken: 'tool-only-claim',
    });
    await completeOvieSummerTurn(store, {
      id,
      claimToken: 'tool-only-claim',
      responseText: '',
      tool: {
        name: 'get_org_state',
        ok: true,
        receiptId: 'tool_only',
        summary: 'org',
      },
    });
    const events: unknown[] = [];
    for await (const event of createCurrentSummerQueueSpeaker(store).speak({
      userText: 'Org state?',
      conversationId: 'summer-session:current',
      clientTurnId: 'tool-only',
      history: [],
    })) {
      events.push(event);
    }
    expect(events).toEqual([
      {
        type: 'tool',
        tool: 'get_org_state',
        ok: true,
        receiptId: 'tool_only',
        summary: 'org',
      },
    ]);
  });
});
