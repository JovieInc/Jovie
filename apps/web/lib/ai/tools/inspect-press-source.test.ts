import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESS_SOURCE_INSPECTED_AT } from './press-source-red-fixtures';
import { isUntrustedSourceFenced } from './untrusted-source-fence';

const { mockSafeFetch, mockMinuteLimit, mockHourLimit } = vi.hoisted(() => ({
  mockSafeFetch: vi.fn(),
  mockMinuteLimit: vi.fn(),
  mockHourLimit: vi.fn(),
}));

vi.mock('@/lib/ai/tools/safe-fetch-public-html', () => ({
  safeFetchPublicHtml: mockSafeFetch,
}));
vi.mock('@/lib/rate-limit', () => ({
  inspectPressSourceLimiter: { limit: mockMinuteLimit },
  inspectPressSourceHourlyLimiter: { limit: mockHourLimit },
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { createInspectPressSourceTool } = await import(
  '@/lib/ai/tools/inspect-press-source'
);

async function runTool(url: string) {
  return createInspectPressSourceTool({
    userId: 'user_test',
    now: () => PRESS_SOURCE_INSPECTED_AT,
  }).execute!(
    { url },
    {
      toolCallId: 'test',
      messages: [],
      abortSignal: new AbortController().signal,
    }
  );
}

beforeEach(() => {
  mockSafeFetch.mockReset();
  mockMinuteLimit.mockReset();
  mockHourLimit.mockReset();
  mockMinuteLimit.mockResolvedValue({ success: true });
  mockHourLimit.mockResolvedValue({ success: true });
});

describe('inspectPressSource', () => {
  it('returns untrusted source-backed evidence without claiming verification', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: true,
      html: '<html><head><meta property="og:title" content="Tour dates announced"><meta property="article:published_time" content="2026-08-30T19:00:00.000Z"></head><body><article><p>North American dates start in October.</p></article></body></html>',
      finalUrl: 'https://example.com/tour/',
    });
    const result = (await runTool('https://example.com/tour')) as {
      ok: true;
      sourceUrl: string;
      freshness: string;
      factualVerification: boolean;
      contentTrust: string;
      headline: string;
      bodyEvidence: string;
    };
    expect(result).toMatchObject({
      ok: true,
      sourceUrl: 'https://example.com/tour/',
      freshness: 'fresh',
      factualVerification: false,
      contentTrust: 'untrusted',
    });
    expect(isUntrustedSourceFenced(result.headline)).toBe(true);
    expect(isUntrustedSourceFenced(result.bodyEvidence)).toBe(true);
  });

  it('forwards typed fetch errors with a hint', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: false, error: 'blocked_host' });
    const result = (await runTool('https://10.0.0.1')) as {
      ok: false;
      reason: string;
      hint: string;
    };
    expect(result).toMatchObject({ ok: false, reason: 'blocked_host' });
    expect(result.hint).toContain('private');
  });

  it('returns no_source_evidence when the page has no headline or body', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: true,
      html: '<html><body></body></html>',
      finalUrl: 'https://example.com/empty/',
    });
    expect(await runTool('https://example.com/empty')).toMatchObject({
      ok: false,
      reason: 'no_source_evidence',
      factualVerification: false,
    });
  });

  it('returns rate_limited before fetching when either limiter rejects', async () => {
    mockMinuteLimit.mockResolvedValueOnce({ success: false });
    expect(
      ((await runTool('https://example.com/tour')) as { reason: string }).reason
    ).toBe('rate_limited');
    expect(mockSafeFetch).not.toHaveBeenCalled();

    mockMinuteLimit.mockResolvedValueOnce({ success: true });
    mockHourLimit.mockResolvedValueOnce({ success: false });
    expect(
      ((await runTool('https://example.com/tour')) as { reason: string }).reason
    ).toBe('rate_limited');
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });
});
