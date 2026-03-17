import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_CSE_MAX_RETRIES,
  GOOGLE_CSE_RETRY_BASE_DELAY_MS,
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

describe('searchGoogleCSE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns an empty list when search API env vars are missing', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_ENGINE_ID', '');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { searchGoogleCSE } = await import('@/lib/leads/google-cse');

    await expect(
      searchGoogleCSE('site:linktr.ee artist spotify')
    ).resolves.toEqual([]);

    expect(pipelineWarnMock).toHaveBeenCalledWith(
      'discovery',
      'Search API not configured',
      {
        missing: [
          'SERPAPI_API_KEY',
          'GOOGLE_CSE_API_KEY',
          'GOOGLE_CSE_ENGINE_ID',
        ],
      }
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(captureErrorMock).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('captures API errors and returns an empty array', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_API_KEY', 'test-api-key');
    vi.stubEnv('GOOGLE_CSE_ENGINE_ID', 'test-engine-id');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 500, message: 'Internal Error' } }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
    );

    const { searchGoogleCSE } = await import('@/lib/leads/google-cse');

    const results = await searchGoogleCSE('site:linktr.ee songwriter');

    expect(results).toEqual([]);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Google CSE API error',
      expect.any(Error),
      expect.objectContaining({
        route: 'leads/google-cse',
        contextData: expect.objectContaining({ code: 500 }),
      })
    );

    fetchMock.mockRestore();
  });

  it('retries transient failures and succeeds without capturing an error', async () => {
    vi.useFakeTimers();
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_API_KEY', 'test-api-key');
    vi.stubEnv('GOOGLE_CSE_ENGINE_ID', 'test-engine-id');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 503, message: 'Service Unavailable' },
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                link: 'https://linktr.ee/example',
                title: 'Example Artist',
                snippet: 'Example snippet',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    const { searchGoogleCSE } = await import('@/lib/leads/google-cse');

    const pending = searchGoogleCSE('site:linktr.ee producer');

    await vi.advanceTimersByTimeAsync(GOOGLE_CSE_RETRY_BASE_DELAY_MS);

    await expect(pending).resolves.toEqual([
      {
        link: 'https://linktr.ee/example',
        title: 'Example Artist',
        snippet: 'Example snippet',
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(captureErrorMock).not.toHaveBeenCalled();

    vi.useRealTimers();
    fetchMock.mockRestore();
  });

  it('fails fast after retries are exhausted and captures request failure', async () => {
    vi.useFakeTimers();
    vi.stubEnv('SERPAPI_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_API_KEY', 'test-api-key');
    vi.stubEnv('GOOGLE_CSE_ENGINE_ID', 'test-engine-id');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('socket hang up'));

    const { searchGoogleCSE } = await import('@/lib/leads/google-cse');

    const pending = searchGoogleCSE('site:linktr.ee songwriter');

    let totalBackoffMs = 0;
    for (let attempt = 1; attempt <= GOOGLE_CSE_MAX_RETRIES; attempt++) {
      totalBackoffMs += GOOGLE_CSE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    }

    await vi.advanceTimersByTimeAsync(totalBackoffMs + 1);

    await expect(pending).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(GOOGLE_CSE_MAX_RETRIES + 1);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Google CSE request failed',
      expect.any(Error),
      expect.objectContaining({
        route: 'leads/google-cse',
        contextData: expect.objectContaining({
          attempts: GOOGLE_CSE_MAX_RETRIES + 1,
        }),
      })
    );

    vi.useRealTimers();
    fetchMock.mockRestore();
  });
});
