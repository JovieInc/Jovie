import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: actual,
    readFileSync: vi.fn(() => {
      throw new Error('missing build id');
    }),
  };
});

describe('@critical GET /api/health/build-info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs warning and returns fallback when build info read fails', async () => {
    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.buildId).toBe('unknown');
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      '[build-info] BUILD_ID not found — expected in dev, using fallback'
    );
  });
});
