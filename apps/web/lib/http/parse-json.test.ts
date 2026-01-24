import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';

describe('parseJsonBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON for valid payloads', async () => {
    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonBody<{ foo: string }>(request, {
      route: 'POST /test',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toEqual({ foo: 'bar' });
  });

  it('logs and captures parse failures', async () => {
    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonBody(request, {
      route: 'POST /test',
      headers: { 'Cache-Control': 'no-store' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const payload = await result.response.json();
      expect(payload.error).toBe('Invalid JSON in request body');
      expect(payload.details).toBeUndefined();
    }

    expect(captureError).toHaveBeenCalledWith(
      '[POST /test] JSON parse failed',
      expect.any(SyntaxError),
      expect.objectContaining({
        context: 'json_parse_failure',
        route: 'POST /test',
        requestUrl: 'https://example.com/api',
        contentType: 'application/json',
      })
    );
  });

  it('includes error details in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: 'oops',
    });

    const result = await parseJsonBody(request, {
      route: 'POST /dev',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const payload = await result.response.json();
      expect(payload.details).toContain('Unexpected');
    }

    vi.unstubAllEnvs();
  });

  it('returns fallback when empty body is allowed', async () => {
    const request = new Request('https://example.com/api', {
      method: 'POST',
    });

    const result = await parseJsonBody<{ defaulted: boolean }>(request, {
      route: 'POST /cron',
      allowEmptyBody: true,
      emptyBodyValue: { defaulted: true },
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toEqual({ defaulted: true });
    expect(captureError).not.toHaveBeenCalled();
  });
});
