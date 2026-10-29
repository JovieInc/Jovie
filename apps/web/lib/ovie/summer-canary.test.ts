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
              : e === 'delta'
                ? '{"text":"pong"}'
                : '{}';
        return `event: ${e}\ndata: ${data}\n\n`;
      })
      .join('')
  );
const run = (fetchChat: unknown) =>
  runSummerCanary({ principalHash: 'p', fetchChat: fetchChat as never });

describe('summer canary', () => {
  it('times the first nonempty text and completes without waiting for the connection to close', async () => {
    let time = 100;
    let index = 0;
    const cancel = vi.fn();
    const frames = [
      [400, 'meta', { model: 'test-model' }],
      [800, 'delta', { text: '' }],
      [1200, 'delta', { text: 'pong' }],
      [5600, 'done', { timing: { modelMs: 4400, providerGuardMs: 17 } }],
    ] as const;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const frame = frames[index++];
          if (!frame) return;
          time = frame[0];
          controller.enqueue(
            new TextEncoder().encode(
              `event: ${frame[1]}\ndata: ${JSON.stringify(frame[2])}\n\n`
            )
          );
        },
        cancel,
      },
      { highWaterMark: 0 }
    );
    const result = await runSummerCanary({
      principalHash: 'p',
      now: () => time,
      fetchChat: (async () => {
        time = 200;
        return new Response(body);
      }) as never,
    });
    expect(result).toMatchObject({
      ok: true,
      headersMs: 100,
      ttftMs: 1100,
      totalMs: 5500,
      trace: { modelMs: 4400, providerGuardMs: 17 },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  }, 1000);

  it.each(['{}', '{"text":""}', '{"text":123}', 'null', '{bad json'])(
    'rejects a non-text delta %s',
    async data => {
      expect(
        await run(
          async () =>
            new Response(
              `event: delta\ndata: ${data}\n\nevent: done\ndata: {}\n\n`
            )
        )
      ).toEqual({ ok: false, code: 'no_text' });
    }
  );

  it('requires text before the terminal frame', async () => {
    expect(await run(async () => sse('done', 'delta'))).toEqual({
      ok: false,
      code: 'no_text',
    });
  });

  it('accepts CRLF framing and a final done frame without a blank line', async () => {
    expect(
      await run(
        async () =>
          new Response(
            'event:delta\r\ndata:{"text":"pong"}\r\n\r\nevent:done\r\ndata:{}'
          )
      )
    ).toMatchObject({ ok: true });
  });

  it('fails on an error after text and cancels the unread body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: delta\ndata: {"text":"partial"}\n\nevent: error\ndata: {}\n\n'
          )
        );
      },
      cancel,
    });
    expect(await run(async () => new Response(body))).toEqual({
      ok: false,
      code: 'stream_error',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it.each(['null', '[]', '"failure"', '{bad json'])(
    'preserves an explicit error event with malformed payload %s',
    async data => {
      expect(
        await run(
          async () =>
            new Response(
              `event: delta\ndata: {"text":"partial"}\n\nevent: error\ndata: ${data}\n\nevent: done\ndata: {}\n\n`
            )
        )
      ).toEqual({ ok: false, code: 'stream_error' });
    }
  );

  it('releases an aborted reader and preserves its failure code', async () => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (reads++ === 0)
            controller.enqueue(
              new TextEncoder().encode(
                'event: delta\ndata: {"text":"partial"}\n\n'
              )
            );
          else
            controller.error(new DOMException('Request aborted', 'AbortError'));
        },
      },
      { highWaterMark: 0 }
    );
    expect(await run(async () => new Response(body))).toEqual({
      ok: false,
      code: 'AbortError',
    });
    expect(body.locked).toBe(false);
  });

  it('discards an HTTP failure body without reading it as chat', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    expect(await run(async () => new Response(body, { status: 503 }))).toEqual({
      ok: false,
      code: 'http_503',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('reports HTTP failure even when cleanup cancellation stays pending', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel });
    expect(await run(async () => new Response(body, { status: 503 }))).toEqual({
      ok: false,
      code: 'http_503',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  }, 1000);

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
      trace: { authMs: 40, modelMs: 900 },
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

describe('incremental first-token measurement', () => {
  /** A stream whose chunks arrive on a controlled clock: the fixture, not response.text(). */
  function timedStream(
    chunks: readonly { at: number; text: string }[],
    clock: { t: number }
  ) {
    const encoder = new TextEncoder();
    let index = 0;
    // highWaterMark 0: pull runs only when the reader asks, so the clock moves
    // exactly when the canary reads each chunk (no read-ahead skew).
    return new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const next = chunks[index++];
            if (!next) {
              controller.close();
              return;
            }
            clock.t = next.at;
            controller.enqueue(encoder.encode(next.text));
          },
        },
        { highWaterMark: 0 }
      )
    );
  }
  const frame = (
    event: string,
    data = event === 'delta' ? '{"text":"pong"}' : '{}'
  ) => `event: ${event}\ndata: ${data}\n\n`;

  it('measures first token at the first delta even when the terminal frame is delayed', async () => {
    const clock = { t: 0 };
    const result = await runSummerCanary({
      principalHash: 'p',
      now: () => clock.t,
      fetchChat: (async () =>
        timedStream(
          [
            { at: 300, text: frame('meta', '{"model":"m"}') },
            { at: 900, text: frame('delta') },
            { at: 9000, text: frame('done') },
          ],
          clock
        )) as never,
    });
    expect(result).toMatchObject({
      ok: true,
      ttftMs: 900,
      totalMs: 9000,
      withinTarget: { p50: true },
    });
  });

  it('measures a delayed first token as slow while the terminal follows immediately', async () => {
    const clock = { t: 0 };
    const result = await runSummerCanary({
      principalHash: 'p',
      now: () => clock.t,
      fetchChat: (async () =>
        timedStream(
          [
            { at: 100, text: frame('meta') },
            { at: 6300, text: frame('delta') + frame('done') },
          ],
          clock
        )) as never,
    });
    expect(result).toMatchObject({
      ok: true,
      ttftMs: 6300,
      totalMs: 6300,
      withinTarget: { p50: false },
    });
  });

  it('records a complete lone-CR delta when it arrives rather than when later data arrives', async () => {
    const clock = { t: 0 };
    expect(
      await runSummerCanary({
        principalHash: 'p',
        now: () => clock.t,
        fetchChat: (async () =>
          timedStream(
            [
              { at: 900, text: 'event:delta\rdata:{"text":"pong"}\r\r' },
              { at: 9000, text: frame('done') },
            ],
            clock
          )) as never,
      })
    ).toMatchObject({ ok: true, ttftMs: 900, totalMs: 9000 });
  });

  it('does not count a stream truncated before its terminal frame as a pass', async () => {
    const clock = { t: 0 };
    expect(
      await runSummerCanary({
        principalHash: 'p',
        now: () => clock.t,
        fetchChat: (async () =>
          timedStream([{ at: 400, text: frame('delta') }], clock)) as never,
      })
    ).toEqual({ ok: false, code: 'no_done' });
  });
});
