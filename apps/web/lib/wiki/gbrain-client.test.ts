import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-server', () => ({
  env: {
    GBRAIN_API_KEY: 'test-key',
    GBRAIN_API_URL: 'https://gbrain.example.test',
  },
}));

import { searchPages } from '@/lib/wiki/gbrain-client';

afterEach(() => {
  vi.unstubAllGlobals();
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
