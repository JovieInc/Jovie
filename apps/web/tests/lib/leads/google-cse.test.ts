import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEARCH_API_MAX_RETRIES,
  SEARCH_API_RETRY_BASE_DELAY_MS,
} from '@/lib/leads/constants';

const { captureErrorMock, pipelineLogMock, pipelineWarnMock } = vi.hoisted(
  () => ({
    captureErrorMock: vi.fn(),
    pipelineLogMock: vi.fn(),
    pipelineWarnMock: vi.fn(),
  })
);

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: pipelineLogMock,
  pipelineWarn: pipelineWarnMock,
}));

describe('web search providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns not_configured and ignores legacy Google CSE credentials', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('EXA_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_API_KEY', 'legacy-api-key');
    vi.stubEnv('GOOGLE_CSE_ENGINE_ID', 'legacy-engine-id');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { searchWebWithStatus } = await import('@/lib/leads/google-cse');

    await expect(
      searchWebWithStatus('site:linktr.ee artist spotify')
    ).resolves.toEqual({
      status: 'not_configured',
      provider: 'none',
      results: [],
      error: 'missing env: SERPAPI_API_KEY, EXA_API_KEY',
    });
    expect(pipelineWarnMock).toHaveBeenCalledWith(
      'discovery',
      'Search API not configured',
      { missing: ['SERPAPI_API_KEY', 'EXA_API_KEY'] }
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('uses Exa domain filters and preserves 1-based pagination', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('EXA_API_KEY', 'exa-key');
    const exaResults = Array.from({ length: 20 }, (_, index) => ({
      url: `https://linktr.ee/artist-${index + 1}`,
      title: `Artist ${index + 1}`,
    }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: exaResults }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { searchWebWithStatus } = await import('@/lib/leads/google-cse');
    const result = await searchWebWithStatus(
      'site:linktr.ee indie artist spotify',
      11
    );

    expect(result).toMatchObject({
      status: 'ok',
      provider: 'exa',
    });
    expect(result.results).toHaveLength(10);
    expect(result.results[0]).toEqual({
      link: 'https://linktr.ee/artist-11',
      title: 'Artist 11',
      snippet: '',
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.exa.ai/search');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'exa-key',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'indie artist spotify',
      includeDomains: ['linktr.ee'],
      type: 'auto',
      numResults: 20,
    });
  });

  it('prefers SerpAPI when both providers are configured', async () => {
    vi.stubEnv('SERPAPI_API_KEY', 'serp-key');
    vi.stubEnv('EXA_API_KEY', 'exa-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          organic_results: [
            {
              link: 'https://linktr.ee/example',
              title: 'Example Artist',
              snippet: 'Example snippet',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { searchWebWithStatus } = await import('@/lib/leads/google-cse');
    await expect(searchWebWithStatus('artist', 1)).resolves.toMatchObject({
      status: 'ok',
      provider: 'serpapi',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'https://serpapi.com/search.json'
    );
  });

  it('classifies Exa quota responses without reporting empty demand', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('EXA_API_KEY', 'exa-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Credits exhausted' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { searchWebWithStatus } = await import('@/lib/leads/google-cse');
    await expect(searchWebWithStatus('artist', 1)).resolves.toEqual({
      status: 'quota_exceeded',
      provider: 'exa',
      results: [],
      error: 'Credits exhausted',
    });
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('retries transient Exa failures and succeeds', async () => {
    vi.useFakeTimers();
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('EXA_API_KEY', 'exa-key');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Service unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              { url: 'https://linktr.ee/example', title: 'Example Artist' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const { searchWeb } = await import('@/lib/leads/google-cse');
    const pending = searchWeb('site:linktr.ee producer');
    await vi.advanceTimersByTimeAsync(SEARCH_API_RETRY_BASE_DELAY_MS);

    await expect(pending).resolves.toEqual([
      {
        link: 'https://linktr.ee/example',
        title: 'Example Artist',
        snippet: '',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('captures an Exa network failure after retries are exhausted', async () => {
    vi.useFakeTimers();
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('EXA_API_KEY', 'exa-key');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('socket hang up'));

    const { searchWeb } = await import('@/lib/leads/google-cse');
    const pending = searchWeb('site:linktr.ee songwriter');
    let totalBackoffMs = 0;
    for (let attempt = 1; attempt <= SEARCH_API_MAX_RETRIES; attempt++) {
      totalBackoffMs += SEARCH_API_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    }
    await vi.advanceTimersByTimeAsync(totalBackoffMs + 1);

    await expect(pending).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(SEARCH_API_MAX_RETRIES + 1);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Exa request failed',
      expect.any(Error),
      expect.objectContaining({
        route: 'leads/web-search',
        contextData: expect.objectContaining({
          attempts: SEARCH_API_MAX_RETRIES + 1,
        }),
      })
    );
  });
});
