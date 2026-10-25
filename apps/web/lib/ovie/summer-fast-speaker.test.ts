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
          ['done', {}],
        ]),
    });
    expect(await collect(speaker)).toEqual([
      { type: 'text-delta', text: 'Queue ' },
      { type: 'text-delta', text: 'is clear.' },
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
