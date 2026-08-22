import { afterEach, describe, expect, it } from 'vitest';
import { denyEveAction, EveAuthorityError } from '@/lib/ovie/eve-authority';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import { OvieProgramError } from '@/lib/ovie/program';
import {
  appendSummerTurn,
  CURRENT_SUMMER_SESSION_ID,
  loadCurrentSummerSession,
} from '@/lib/ovie/summer-session';
import {
  assertNotForbiddenFallback,
  bindCurrentSummerSpeaker,
  disableSummerTransport,
  enableSummerTransport,
  relaunchCurrentSummerSession,
  resetSummerTransportRuntime,
  resolveOvieDoorGeneration,
  runOvieSummerTurn,
  type SummerSpeaker,
} from '@/lib/ovie/summer-transport';

const RECEIPT = {
  text: 'research eval dogfood',
  lane: 'heavy' as const,
  destination: 'kanban' as const,
  ack: 'stored and queued for Summer lander',
  destinationHandle: null,
  workerSpawned: false as const,
  workId: 'ini_work_1',
};

function scriptedSummer(options?: {
  readonly replies?: readonly string[];
  readonly tool?: {
    readonly name: string;
    readonly ok: boolean;
    readonly receiptId: string;
    readonly summary: string;
  };
  readonly hangUntilAbort?: boolean;
}): SummerSpeaker {
  let index = 0;
  const replies = options?.replies ?? ['Summer ack.'];
  return {
    id: 'summer',
    runtime: 'mac',
    async *speak(input) {
      if (options?.hangUntilAbort) {
        await new Promise<void>((resolve, reject) => {
          if (input.signal?.aborted) {
            reject(new Error('aborted'));
            return;
          }
          input.signal?.addEventListener('abort', () => resolve(), {
            once: true,
          });
        });
        return;
      }
      const text = replies[Math.min(index, replies.length - 1)] ?? '';
      index += 1;
      yield { type: 'text-delta', text };
      if (options?.tool) {
        yield {
          type: 'tool',
          tool: options.tool.name,
          ok: options.tool.ok,
          receiptId: options.tool.receiptId,
          summary: options.tool.summary,
        };
      }
    },
  };
}

async function collect(
  events:
    | AsyncIterable<
        Parameters<typeof runOvieSummerTurn> extends never ? never : never
      >
    | AsyncIterable<{
        type: string;
        text?: string;
        state?: string;
        binding?: { eveWorkId: string | null; speaker: string };
        receipt?: { receiptId: string; ok: boolean };
      }>
) {
  const rows: unknown[] = [];
  let text = '';
  for await (const event of events) {
    rows.push(event);
    if (event.type === 'text-delta' && event.text) text += event.text;
  }
  return { rows, text };
}

describe('Summer transport (JOV-5212)', () => {
  afterEach(() => {
    resetSummerTransportRuntime();
  });

  it('fails closed without a bound current Summer and never falls back', () => {
    const generation = resolveOvieDoorGeneration('ov', [RECEIPT]);
    expect(generation.kind).toBe('summer-transport');
    if (generation.kind !== 'summer-transport') return;
    expect(generation.state).toBe('unavailable');
    expect(generation.session).toBeNull();
    expect(generation.text).toMatch(/unavailable/i);
    expect(generation.text.toLowerCase()).not.toMatch(/i am ovie/);
    expect(() => assertNotForbiddenFallback('jovie')).toThrow(OvieProgramError);
    expect(() => assertNotForbiddenFallback('eve-as-speaker')).toThrow(
      OvieProgramError
    );
    expect(() => assertNotForbiddenFallback('mock')).toThrow(OvieProgramError);
    expect(() =>
      bindCurrentSummerSpeaker({
        id: 'mock' as unknown as 'summer',
        runtime: 'mac',
        async *speak() {},
      })
    ).toThrow(/current Mac Summer/);
    expect(() => denyEveAction('summer-answer')).toThrow(EveAuthorityError);
  });

  it('binds Eve receipts to a five-turn current Summer conversation', async () => {
    const store = new MemoryOperatingStore();
    const speaker = scriptedSummer({
      replies: ['one', 'two', 'three', 'four', 'five'],
    });
    bindCurrentSummerSpeaker(speaker);
    const bound = resolveOvieDoorGeneration('ov', [RECEIPT], { speaker });
    expect(bound.kind).toBe('summer-transport');
    if (bound.kind !== 'summer-transport') return;
    expect(bound.state).toBe('fresh');
    expect(bound.session?.sessionId).toBe(CURRENT_SUMMER_SESSION_ID);

    const texts: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const result = await collect(
        runOvieSummerTurn({
          receipts: [RECEIPT],
          userText: `turn ${i + 1}`,
          speaker,
          store,
          clientTurnId: `client-${i + 1}`,
        })
      );
      texts.push(result.text);
      const binding = result.rows.find(
        row => (row as { type: string }).type === 'binding'
      ) as {
        binding: { eveWorkId: string | null; speaker: string };
      };
      expect(binding.binding.eveWorkId).toBe('ini_work_1');
      expect(binding.binding.speaker).toBe('summer');
    }

    expect(texts).toEqual(['one', 'two', 'three', 'four', 'five']);
    const session = await loadCurrentSummerSession(store);
    expect(session?.identity.speaker).toBe('summer');
    expect(session?.identity.memoryNamespace).toBe('summer');
    expect(session?.turns).toHaveLength(5);
    expect(session?.turns.map(turn => turn.assistantText)).toEqual(texts);

    const relaunched = await relaunchCurrentSummerSession(store);
    expect(relaunched.turns).toHaveLength(5);
    expect(relaunched.identity.sessionId).toBe(CURRENT_SUMMER_SESSION_ID);
    const replay = await collect(
      runOvieSummerTurn({
        receipts: [RECEIPT],
        userText: 'turn 1',
        speaker,
        store,
        clientTurnId: 'client-1',
      })
    );
    expect(replay.text).toBe('one');
    expect((await loadCurrentSummerSession(store))?.turns).toHaveLength(5);

    const longStore = new MemoryOperatingStore();
    const longSpeaker = scriptedSummer({
      replies: Array.from({ length: 12 }, (_, i) => `long-${i + 1}`),
    });
    for (let i = 0; i < 12; i += 1) {
      await collect(
        runOvieSummerTurn({
          receipts: [RECEIPT],
          userText: `long ${i + 1}`,
          speaker: longSpeaker,
          store: longStore,
          clientTurnId: `long-${i + 1}`,
        })
      );
    }
    expect((await loadCurrentSummerSession(longStore))?.turns).toHaveLength(12);
  });

  it('records a safe Summer tool receipt and a failed tool state', async () => {
    const store = new MemoryOperatingStore();
    const okSpeaker = scriptedSummer({
      replies: ['org state'],
      tool: {
        name: 'get_org_state',
        ok: true,
        receiptId: 'tool_ok_1',
        summary: 'read-only org snapshot',
      },
    });
    const ok = await collect(
      runOvieSummerTurn({
        receipts: [RECEIPT],
        userText: 'show org state',
        speaker: okSpeaker,
        store,
        clientTurnId: 'tool-ok',
      })
    );
    const receipt = ok.rows.find(
      row => (row as { type: string }).type === 'tool'
    ) as {
      receipt: { receiptId: string; ok: boolean; tool: string };
    };
    expect(receipt.receipt).toMatchObject({
      receiptId: 'tool_ok_1',
      ok: true,
      tool: 'get_org_state',
    });

    const failStore = new MemoryOperatingStore();
    const failed = await collect(
      runOvieSummerTurn({
        receipts: [RECEIPT],
        userText: 'post merch',
        speaker: scriptedSummer({
          replies: ['nope'],
          tool: {
            name: 'proposeAvatarUpload',
            ok: false,
            receiptId: 'tool_bad',
            summary: 'artist tool',
          },
        }),
        store: failStore,
        clientTurnId: 'tool-bad',
      })
    );
    expect(
      failed.rows.some(
        row => (row as { state?: string }).state === 'failed_tool'
      )
    ).toBe(true);

    const safeFail = await collect(
      runOvieSummerTurn({
        receipts: [RECEIPT],
        userText: 'org missing',
        speaker: scriptedSummer({
          replies: ['cannot'],
          tool: {
            name: 'get_org_state',
            ok: false,
            receiptId: 'tool_fail',
            summary: 'org snapshot failed',
          },
        }),
        store: failStore,
        clientTurnId: 'tool-fail',
      })
    );
    expect(
      safeFail.rows.some(
        row => (row as { state?: string }).state === 'failed_tool'
      )
    ).toBe(true);
  });

  it('surfaces cancel, disable, and reconnect without forking the session', async () => {
    const store = new MemoryOperatingStore();
    const speaker = scriptedSummer({ hangUntilAbort: true });
    const abort = new AbortController();
    const pending = collect(
      runOvieSummerTurn({
        receipts: [RECEIPT],
        userText: 'long turn',
        speaker,
        store,
        signal: abort.signal,
        clientTurnId: 'cancel-1',
      })
    );
    abort.abort();
    const canceled = await pending;
    expect(
      canceled.rows.some(
        row => (row as { type?: string; state?: string }).state === 'canceled'
      )
    ).toBe(true);
    expect((await loadCurrentSummerSession(store))?.turns ?? []).toHaveLength(
      0
    );

    disableSummerTransport();
    const disabled = resolveOvieDoorGeneration('ov', [RECEIPT], { speaker });
    expect(disabled.kind).toBe('summer-transport');
    if (disabled.kind === 'summer-transport') {
      expect(disabled.state).toBe('unavailable');
      expect(disabled.session).toBeNull();
    }
    enableSummerTransport();
    const resumed = await relaunchCurrentSummerSession(store);
    expect(resumed.identity.sessionId).toBe(CURRENT_SUMMER_SESSION_ID);
  });

  it('replaces a legacy canceled session row when reconnect recovers the Mac turn', async () => {
    const store = new MemoryOperatingStore();
    await appendSummerTurn(store, {
      clientTurnId: 'legacy-cancel',
      userText: 'Resume me',
      assistantText: '',
      eveWorkId: 'ini_work_1',
      eveAcks: [RECEIPT.ack],
      correlationId: 'ini_work_1:legacy-cancel',
      state: 'canceled',
      toolReceipt: null,
      createdAt: new Date().toISOString(),
    });
    const recovered = await collect(
      runOvieSummerTurn({
        receipts: [RECEIPT],
        userText: 'Resume me',
        speaker: scriptedSummer({ replies: ['Recovered Summer.'] }),
        store,
        clientTurnId: 'legacy-cancel',
      })
    );
    expect(recovered.text).toBe('Recovered Summer.');
    const session = await loadCurrentSummerSession(store);
    expect(session?.turns).toHaveLength(1);
    expect(session?.turns[0]).toMatchObject({
      assistantText: 'Recovered Summer.',
      state: 'completed',
    });
  });
});
