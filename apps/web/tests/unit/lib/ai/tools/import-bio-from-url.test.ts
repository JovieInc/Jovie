import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSafeFetch, mockMinuteLimit, mockHourLimit } = vi.hoisted(() => ({
  mockSafeFetch: vi.fn(),
  mockMinuteLimit: vi.fn(),
  mockHourLimit: vi.fn(),
}));

vi.mock('@/lib/ai/tools/safe-fetch-public-html', () => ({
  safeFetchPublicHtml: mockSafeFetch,
}));

vi.mock('@/lib/rate-limit', () => ({
  bioImportFromUrlLimiter: { limit: mockMinuteLimit },
  bioImportFromUrlHourlyLimiter: { limit: mockHourLimit },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { createImportBioFromUrlTool } = await import(
  '@/lib/ai/tools/import-bio-from-url'
);

async function runTool(args: { url: string }) {
  const t = createImportBioFromUrlTool({ userId: 'user_test' });
  const execute = t.execute!;
  return execute(args, {
    toolCallId: 'test',
    messages: [],
    abortSignal: new AbortController().signal,
  });
}

beforeEach(() => {
  mockSafeFetch.mockReset();
  mockMinuteLimit.mockReset();
  mockHourLimit.mockReset();
  // Default: under both limits.
  mockMinuteLimit.mockResolvedValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: new Date(),
  });
  mockHourLimit.mockResolvedValue({
    success: true,
    limit: 20,
    remaining: 19,
    reset: new Date(),
  });
});

describe('importBioFromUrl', () => {
  it('returns ok=true with sanitized bio + provenance on success', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: true,
      html: '<html><head><meta property="og:description" content="Brooklyn DJ blending house and disco."></head></html>',
      finalUrl: 'https://timwhite.co/',
      sourceTitle: 'Tim White',
    });

    const result = (await runTool({ url: 'https://timwhite.co' })) as {
      ok: true;
      candidateBio: string;
      sourceUrl: string;
      sourceTitle?: string;
    };

    expect(result.ok).toBe(true);
    expect(result.candidateBio).toBe('Brooklyn DJ blending house and disco.');
    expect(result.sourceUrl).toBe('https://timwhite.co/');
    expect(result.sourceTitle).toBe('Tim White');
  });

  it('forwards typed errors from the fetcher with a hint', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: false,
      error: 'blocked_host',
    });

    const result = (await runTool({ url: 'https://10.0.0.1' })) as {
      ok: false;
      reason: string;
      hint: string;
    };

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('blocked_host');
    expect(result.hint).toContain('private');
  });

  it('returns no_bio_found when the page has no usable bio', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: true,
      html: '<html><body>Just an SPA shell</body></html>',
      finalUrl: 'https://example.spa/',
      sourceTitle: undefined,
    });

    const result = (await runTool({ url: 'https://example.spa' })) as {
      ok: false;
      reason: string;
      hint: string;
      sourceUrl?: string;
    };

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_bio_found');
    expect(result.sourceUrl).toBe('https://example.spa/');
  });

  it('returns rate_limited when the per-minute limiter rejects', async () => {
    mockMinuteLimit.mockResolvedValueOnce({
      success: false,
      limit: 5,
      remaining: 0,
      reset: new Date(),
    });

    const result = (await runTool({ url: 'https://timwhite.co' })) as {
      ok: false;
      reason: string;
    };

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('rate_limited');
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('returns rate_limited when the hourly limiter rejects', async () => {
    mockHourLimit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: new Date(),
    });

    const result = (await runTool({ url: 'https://timwhite.co' })) as {
      ok: false;
      reason: string;
    };

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('rate_limited');
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });
});
