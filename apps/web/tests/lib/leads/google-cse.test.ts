import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    delete process.env.GOOGLE_CSE_API_KEY;
    delete process.env.GOOGLE_CSE_ENGINE_ID;
  });

  it('returns an empty result and logs a warning when CSE env vars are missing', async () => {
    const { searchGoogleCSE } = await import('@/lib/leads/google-cse');

    const results = await searchGoogleCSE('site:linktr.ee musician spotify');

    expect(results).toEqual([]);
    expect(pipelineWarnMock).toHaveBeenCalledWith(
      'discovery',
      'Google CSE not configured',
      { missing: ['GOOGLE_CSE_API_KEY', 'GOOGLE_CSE_ENGINE_ID'] }
    );
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('captures API errors and returns an empty array', async () => {
    process.env.GOOGLE_CSE_API_KEY = 'test-api-key';
    process.env.GOOGLE_CSE_ENGINE_ID = 'test-engine-id';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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
});
