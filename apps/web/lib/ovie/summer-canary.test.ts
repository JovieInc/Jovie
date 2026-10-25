import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/summer-shadow-client', () => ({
  fetchSummerShadow: vi.fn(),
}));

import { readSummerTtftSummary, runSummerCanary } from './summer-canary';

const sse = (...events: string[]) =>
  new Response(
    events
      .map(e => {
        const data =
          e === 'done'
            ? '{"timing":{"authMs":40,"queueMs":1,"setupMs":5,"modelMs":900,"uptimeS":3.2}}'
            : e === 'meta'
              ? '{"model":"zai/glm-5.3-flash"}'
              : '{}';
        return `event: ${e}\ndata: ${data}\n\n`;
      })
      .join('')
  );
const run = (fetchChat: unknown) =>
  runSummerCanary({ principalHash: 'p', fetchChat: fetchChat as never });

describe('summer canary', () => {
  it('records first-token time separately from total, with the server hop trace', async () => {
    let t = 0;
    const result = await runSummerCanary({
      principalHash: 'p',
      now: () => (t += 100),
      fetchChat: (async () => sse('meta', 'delta', 'done')) as never,
    });
    expect(result).toMatchObject({
      ok: true,
      model: 'zai/glm-5.3-flash',
      server: { authMs: 40, modelMs: 900, uptimeS: 3.2 },
    });
    if (!result.ok) throw new Error('unreachable');
    expect(result.ttftMs).toBeLessThan(result.totalMs);
    expect(result.headersMs).toBeLessThanOrEqual(result.ttftMs);
  });

  it('flags a first token slower than the 1.5 s p50 target', async () => {
    let t = 0;
    const result = await runSummerCanary({
      principalHash: 'p',
      now: () => (t += 2000),
      fetchChat: (async () => sse('meta', 'delta', 'done')) as never,
    });
    expect(result).toMatchObject({ ok: true, withinTarget: { p50: false } });
  });

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

describe('published first-token percentiles', () => {
  const metrics = (routes: unknown, status = 200) =>
    (async () => Response.json({ routes }, { status })) as never;

  it('reports p50/p95 per route against the 1.5 s / 3 s targets', async () => {
    const summary = await readSummerTtftSummary(
      metrics({
        chat: { ok: 40, ttftMs: { p50: 1200, p95: 2800 } },
        voice: { ok: 5, ttftMs: { p50: 6200, p95: 6500 } },
        plan: { ok: 0, ttftMs: { p50: null, p95: null } },
      }),
      'p'
    );
    expect(summary).toEqual([
      { route: 'chat', sample: 40, p50: 1200, p95: 2800, withinTarget: true },
      { route: 'voice', sample: 5, p50: 6200, p95: 6500, withinTarget: false },
      { route: 'plan', sample: 0, p50: null, p95: null, withinTarget: null },
    ]);
  });

  it('returns null when the metrics read fails', async () => {
    expect(await readSummerTtftSummary(metrics({}, 503), 'p')).toBeNull();
    expect(
      await readSummerTtftSummary(
        (async () => {
          throw new Error('net');
        }) as never,
        'p'
      )
    ).toBeNull();
  });
});
