import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-server', () => ({
  env: {
    GBRAIN_API_KEY: 'test-key',
    GBRAIN_API_URL: 'https://gbrain.example.test',
  },
}));

import { commitOperationalMemory } from '@/lib/ovie/operational-memory';
import { mcpCall, putPage, searchPages } from '@/lib/wiki/gbrain-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('gbrain client', () => {
  it('calls the hybrid query tool through the MCP tools/call envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          id: 'response-1',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify([
                  {
                    slug: 'canon/royalties',
                    title: 'Royalty canon',
                    chunk_text: 'Curated evidence',
                    chunk_source: 'compiled_truth',
                    score: 1.4,
                  },
                ]),
              },
            ],
          },
        })}\n\n`,
        {
          headers: { 'Content-Type': 'text/event-stream' },
          status: 200,
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const hits = await searchPages('How do royalties work?', 6);

    expect(hits[0]).toMatchObject({
      slug: 'canon/royalties',
      chunk_source: 'compiled_truth',
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://gbrain.example.test/mcp');
    expect(JSON.parse(String(init.body))).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'query',
        arguments: {
          detail: 'medium',
          expand: false,
          limit: 6,
          query: 'How do royalties work?',
        },
      },
    });
  });

  it('falls back to the legacy search tool name when needed', async () => {
    const legacyError = new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'response-1',
        result: {
          content: [{ type: 'text', text: 'Unknown operation: query' }],
          isError: true,
        },
      }),
      { status: 200 }
    );
    const legacySuccess = new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'response-2',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  slug: 'canon/sync',
                  title: 'Sync licensing',
                  chunk_text: 'Curated evidence',
                },
              ]),
            },
          ],
        },
      }),
      { status: 200 }
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(legacyError)
      .mockResolvedValueOnce(legacySuccess);
    vi.stubGlobal('fetch', fetchMock);

    const hits = await searchPages('How does sync licensing work?', 6);

    expect(hits).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(JSON.parse(String(secondInit.body))).toMatchObject({
      params: { name: 'search/query' },
    });
  });
});

// Model native fetch: headers resolve immediately, while the body remains open
// until the request signal aborts. No external GBrain connection is used.
function mockHangingBody(headerDelayMs = 0) {
  let requestSignal: AbortSignal | null | undefined;
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          requestSignal?.addEventListener(
            'abort',
            () => {
              controller.error(
                Object.assign(new Error('aborted'), { name: 'AbortError' })
              );
            },
            { once: true }
          );
        },
      })
    );
    return headerDelayMs === 0
      ? Promise.resolve(response)
      : new Promise<Response>(resolve =>
          setTimeout(() => resolve(response), headerDelayMs)
        );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, signal: () => requestSignal };
}

describe('gbrain request lifetime', () => {
  it('bounds a hanging body after immediate headers and never retries a write', async () => {
    vi.useFakeTimers();
    const { fetchMock, signal } = mockHangingBody();
    const settled = vi.fn();
    const pending = putPage({
      slug: 'ops/summer/test',
      title: 'Test',
      body: 'Evidence',
    }).then(settled);
    await vi.advanceTimersByTimeAsync(3500);
    expect(signal()?.aborted).toBe(true);
    expect(settled).toHaveBeenCalledWith({
      ok: false,
      reason: expect.stringContaining('timed out after 3500ms'),
    });
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the same budget for delayed headers and the response body', async () => {
    vi.useFakeTimers();
    const { signal } = mockHangingBody(3000);
    const settled = vi.fn();
    const pending = searchPages('royalties').then(settled);
    await vi.advanceTimersByTimeAsync(3499);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(signal()?.aborted).toBe(true);
    await pending;
    expect(settled).toHaveBeenCalledWith([]);
  });

  it('honors caller cancellation after headers and fails softly', async () => {
    vi.useFakeTimers();
    const { fetchMock, signal } = mockHangingBody();
    const controller = new AbortController();
    const settled = vi.fn();
    const pending = searchPages('royalties', 6, controller.signal).then(
      settled
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(signal()?.aborted).toBe(true);
    expect(settled).toHaveBeenCalledWith([]);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry an opted-in read after caller cancellation', async () => {
    vi.useFakeTimers();
    const { fetchMock } = mockHangingBody();
    const controller = new AbortController();
    const pending = mcpCall(
      'get_page',
      { slug: 'test' },
      { retry: true, signal: controller.signal }
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await pending).toMatchObject({ ok: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not try a write alias for a transport error containing unknown-tool text', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('Unknown tool: put_page'));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await putPage({
        slug: 'ops/summer/test',
        title: 'Test',
        body: 'Evidence',
      })
    ).toEqual({
      ok: false,
      reason: 'gbrain unreachable: Unknown tool: put_page',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function jsonResult(data: unknown) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'response',
      result: { content: [{ type: 'text', text: JSON.stringify(data) }] },
    })
  );
}

describe('gbrain write outcomes', () => {
  it('confirms ordinary JSON success and releases the deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResult({ slug: 'ops/summer/test' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await putPage({
        slug: 'ops/summer/test',
        title: 'Test',
        body: 'Evidence',
      })
    ).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the caller abort listener after a successful body read', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    let requestSignal: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal;
        return Promise.resolve(jsonResult([]));
      })
    );
    expect(await searchPages('royalties', 6, controller.signal)).toEqual([]);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    expect(requestSignal?.aborted).toBe(false);
  });

  it('allows a legacy write alias only after a definite MCP unknown-tool response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'response',
            error: { code: -32601, message: 'Tool put_page not found' },
          })
        )
      )
      .mockResolvedValueOnce(jsonResult({ slug: 'ops/summer/test' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await putPage({
        slug: 'ops/summer/test',
        title: 'Test',
        body: 'Evidence',
      })
    ).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).params.name).toBe(
      'page/put'
    );
  });

  it.each([429, 503])(
    'sanitizes HTTP %s without retrying or trying an alias',
    async status => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response('Unknown operation: private diagnostic', { status })
        );
      vi.stubGlobal('fetch', fetchMock);
      expect(
        await putPage({
          slug: 'ops/summer/test',
          title: 'Test',
          body: 'Evidence',
        })
      ).toEqual({ ok: false, reason: `gbrain HTTP ${status}` });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('does not retry an uncertain write when its acknowledgement is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not JSON'));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await putPage({
        slug: 'ops/summer/test',
        title: 'Test',
        body: 'Evidence',
      })
    ).toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('buffers a timed-out write without claiming confirmation', async () => {
    vi.useFakeTimers();
    const { fetchMock } = mockHangingBody();
    const bufferRecord = vi.fn().mockResolvedValue({ bufferId: 'buffer-1' });
    const pending = commitOperationalMemory(
      {
        slug: 'ops/summer/test',
        title: 'Test',
        body: 'Evidence',
        kind: 'observed',
        sourceRefs: ['test:bounded-request'],
        observedAt: '2026-11-04T00:00:00Z',
        author: 'test',
      },
      { writeGbrainPage: putPage, bufferRecord }
    );
    await vi.advanceTimersByTimeAsync(3500);
    expect(await pending).toMatchObject({
      status: 'buffered',
      bufferId: 'buffer-1',
      reason: expect.stringContaining('timed out'),
    });
    expect(bufferRecord).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains one retry for opted-in reads whose response body times out', async () => {
    vi.useFakeTimers();
    const { fetchMock } = mockHangingBody();
    const pending = mcpCall('get_page', { slug: 'test' }, { retry: true });
    await vi.advanceTimersByTimeAsync(3500);
    fetchMock.mockResolvedValueOnce(jsonResult({ slug: 'test' }));
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toEqual({ ok: true, data: { slug: 'test' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
