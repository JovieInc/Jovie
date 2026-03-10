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
    vi.unstubAllEnvs();
  });

  it('returns an empty list when Google CSE env vars are missing', async () => {
    vi.stubEnv('GOOGLE_CSE_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_ENGINE_ID', '');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { searchGoogleCSE } = await import('@/lib/leads/google-cse');

    await expect(
      searchGoogleCSE('site:linktr.ee artist spotify')
    ).resolves.toEqual([]);

    expect(pipelineWarnMock).toHaveBeenCalledWith(
      'discovery',
      'Google CSE not configured',
      { missing: ['GOOGLE_CSE_API_KEY', 'GOOGLE_CSE_ENGINE_ID'] }
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(captureErrorMock).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
