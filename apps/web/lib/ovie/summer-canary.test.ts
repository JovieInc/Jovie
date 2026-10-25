import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/summer-shadow-client', () => ({
  fetchSummerShadow: vi.fn(),
}));

import { runSummerCanary } from './summer-canary';

const sse = (...events: string[]) =>
  new Response(events.map(e => `event: ${e}\ndata: {}\n\n`).join(''));
const run = (fetchChat: unknown) =>
  runSummerCanary({ principalHash: 'p', fetchChat: fetchChat as never });

describe('summer canary', () => {
  it('passes on text then done, and sends no history', async () => {
    const fetchChat = vi.fn(async () => sse('meta', 'delta', 'done'));
    expect((await run(fetchChat)).ok).toBe(true);
    const init = (
      fetchChat.mock.calls[0] as unknown as [string, { body: string }]
    )[1];
    expect(JSON.parse(init.body)).toMatchObject({ mode: 'voice', history: [] });
  });
  it.each([
    ['stream error', sse('meta', 'error'), 'stream_error'],
    ['no text', sse('meta', 'done'), 'no_text'],
    ['no done', sse('delta'), 'no_done'],
    ['http error', new Response('x', { status: 404 }), 'http_404'],
  ])('fails on %s', async (_name, response, code) => {
    expect(await run(async () => response)).toEqual({ ok: false, code });
  });
  it('fails on transport errors', async () => {
    expect(
      (
        await run(async () => {
          throw new Error('net');
        })
      ).ok
    ).toBe(false);
  });
});
