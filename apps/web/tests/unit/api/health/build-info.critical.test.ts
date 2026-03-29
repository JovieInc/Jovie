import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
const mutableEnv = process.env as Record<string, string | undefined>;
let originalNodeEnv: string | undefined;
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

describe('@critical GET /api/health/build-info', () => {
  beforeEach(() => {
    originalNodeEnv = mutableEnv.NODE_ENV;
    vi.clearAllMocks();
    vi.resetModules();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/__missing-build-id__');
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    cwdSpy = undefined;

    if (originalNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV;
      return;
    }

    mutableEnv.NODE_ENV = originalNodeEnv;
  });

  it('logs warning and returns fallback when build info read fails in production', async () => {
    mutableEnv.NODE_ENV = 'production';

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.buildId).toBe('unknown');
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      '[build-info] BUILD_ID not found — using fallback'
    );
  });

  it('returns development build id without warning in development', async () => {
    mutableEnv.NODE_ENV = 'development';

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    expect(response.status).toBe(200);
    expect(mockConsoleWarn).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.buildId).toBe('development');
  });
});
