import { describe, expect, it } from 'vitest';

import {
  createFallbackSummerSpeaker,
  fastChatEnabled,
  needsDurableWork,
} from './summer-fast-speaker';
import type { SummerSpeakEvent, SummerSpeaker } from './summer-transport';

const sse = (events: [string, object][]) =>
  new Response(
    events
      .map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`)
      .join(''),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );

const eve: SummerSpeaker = {
  id: 'summer',
  runtime: 'eve',
  async *speak() {
    yield { type: 'text-delta', text: 'from eve' };
  },
};
const turn = { userText: 'how is shipping', history: [] } as const;
async function collect(
  speaker: SummerSpeaker,
  userText: string = turn.userText
) {
  const out: SummerSpeakEvent[] = [];
  for await (const e of speaker.speak({ ...turn, userText })) out.push(e);
  return out;
}

describe('fast Summer speaker', () => {
  it('streams deltas from the fast endpoint', async () => {
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () =>
        sse([
          ['meta', {}],
          ['delta', { text: 'Queue ' }],
          ['delta', { text: 'is clear.' }],
          [
            'done',
            {
              requestId: 'chat_1',
              route: 'chat',
              model: 'zai/glm-5.3-flash',
              ttftMs: 700,
              totalMs: 900,
            },
          ],
        ]),
    });
    expect(await collect(speaker)).toEqual([
      { type: 'text-delta', text: 'Queue ' },
      { type: 'text-delta', text: 'is clear.' },
      {
        type: 'ack',
        ack: {
          requestId: 'chat_1',
          route: 'chat',
          model: 'zai/glm-5.3-flash',
          ttftMs: 700,
          totalMs: 900,
        },
      },
    ]);
  });

  it('passes the endpoint progress through typed and in order, inventing none', async () => {
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () =>
        sse([
          [
            'meta',
            { requestId: 'chat_1', route: 'chat', model: 'zai/glm-5.3-flash' },
          ],
          ['tool', { name: 'shipping_state', phase: 'start' }],
          ['tool', { name: 'shipping_state', phase: 'done', ms: 420 }],
          [
            'status',
            {
              phase: 'planner',
              model: 'moonshotai/kimi-k3.1-pro',
              text: 'Handing to the planner',
            },
          ],
          ['tool', { name: 'spend', phase: 'bogus' }],
          ['mystery', { x: 1 }],
          ['delta', { text: 'Ok.' }],
          [
            'plan',
            {
              planId: 'pln_1',
              path: '/p/pln_1',
              model: 'moonshotai/kimi-k3.1-pro',
              summary: 'Do X.',
            },
          ],
          [
            'done',
            {
              requestId: 'chat_1',
              route: 'chat',
              model: 'zai/glm-5.3-flash',
              ttftMs: 700,
              totalMs: 900,
            },
          ],
        ]),
    });
    expect(await collect(speaker)).toEqual([
      {
        type: 'progress',
        progress: {
          kind: 'meta',
          requestId: 'chat_1',
          route: 'chat',
          model: 'zai/glm-5.3-flash',
        },
      },
      {
        type: 'progress',
        progress: {
          kind: 'tool',
          name: 'shipping_state',
          phase: 'start',
          ms: null,
        },
      },
      {
        type: 'progress',
        progress: {
          kind: 'tool',
          name: 'shipping_state',
          phase: 'done',
          ms: 420,
        },
      },
      {
        type: 'progress',
        progress: {
          kind: 'status',
          phase: 'planner',
          model: 'moonshotai/kimi-k3.1-pro',
          text: 'Handing to the planner',
        },
      },
      { type: 'text-delta', text: 'Ok.' },
      {
        type: 'progress',
        progress: {
          kind: 'plan',
          planId: 'pln_1',
          path: '/p/pln_1',
          model: 'moonshotai/kimi-k3.1-pro',
          summary: 'Do X.',
        },
      },
      {
        type: 'ack',
        ack: {
          requestId: 'chat_1',
          route: 'chat',
          model: 'zai/glm-5.3-flash',
          ttftMs: 700,
          totalMs: 900,
        },
      },
    ]);
  });

  it('reports a stream truncated after text as a failure, never as a completed answer', async () => {
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () => sse([['delta', { text: 'Partial' }]]),
    });
    const events = await collect(speaker);
    expect(events).toEqual([
      { type: 'text-delta', text: 'Partial' },
      { type: 'error', state: 'failure' },
    ]);
    expect(events.some(e => e.type === 'ack')).toBe(false);
  });

  it('does not forward an ack for a stream with no text (Eve answers instead)', async () => {
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () =>
        sse([
          [
            'done',
            {
              requestId: 'chat_1',
              route: 'chat',
              model: 'zai/glm-5.3-flash',
              ttftMs: 700,
              totalMs: 900,
            },
          ],
        ]),
    });
    expect(await collect(speaker)).toEqual([
      { type: 'text-delta', text: 'from eve' },
    ]);
  });

  it('does not accept a done frame that names no request as an acknowledgement', async () => {
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () =>
        sse([
          ['delta', { text: 'Hi' }],
          ['done', {}],
        ]),
    });
    expect(await collect(speaker)).toEqual([
      { type: 'text-delta', text: 'Hi' },
      { type: 'error', state: 'failure' },
    ]);
  });

  it('falls back to Eve when the endpoint is not deployed', async () => {
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () => new Response('nope', { status: 404 }),
    });
    expect(await collect(speaker)).toEqual([
      { type: 'text-delta', text: 'from eve' },
    ]);
  });

  it('falls back to Eve on a transport throw and on an error before any text', async () => {
    const throwing = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () => {
        throw new Error('network');
      },
    });
    expect(await collect(throwing)).toEqual([
      { type: 'text-delta', text: 'from eve' },
    ]);
    const early = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () => sse([['error', { code: 'chat-unavailable' }]]),
    });
    expect(await collect(early)).toEqual([
      { type: 'text-delta', text: 'from eve' },
    ]);
  });

  it('falls back to Eve when the stream ends without any text', async () => {
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () =>
        sse([
          ['meta', {}],
          [
            'done',
            {
              requestId: 'chat_1',
              route: 'chat',
              model: 'zai/glm-5.3-flash',
              ttftMs: 700,
              totalMs: 900,
            },
          ],
        ]),
    });
    expect(await collect(speaker)).toEqual([
      { type: 'text-delta', text: 'from eve' },
    ]);
  });

  it('reports failure when the stream errors after text was shown', async () => {
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () =>
        sse([
          ['delta', { text: 'Partial' }],
          ['error', { code: 'chat-unavailable' }],
        ]),
    });
    expect(await collect(speaker)).toEqual([
      { type: 'text-delta', text: 'Partial' },
      { type: 'error', state: 'failure' },
    ]);
  });

  it('keeps durable work on Eve and honors the kill switch', async () => {
    let called = 0;
    const speaker = createFallbackSummerSpeaker({
      eve,
      fetchChat: async () => {
        called++;
        return sse([['delta', { text: 'x' }]]);
      },
    });
    expect(await collect(speaker, 'close JOV-123 and merge the PR')).toEqual([
      { type: 'text-delta', text: 'from eve' },
    ]);
    expect(called).toBe(0);
    expect(needsDurableWork('what is the queue depth')).toBe(false);
    expect(needsDurableWork('update me on the roadmap')).toBe(false);
    expect(needsDurableWork('Please close JOV-9')).toBe(true);
    expect(
      fastChatEnabled({
        OVIE_SUMMER_FAST_CHAT: '0',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
    expect(fastChatEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
