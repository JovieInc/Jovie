import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRecord,
  mockCaptureError,
  mockRateLimit,
  mockCreateRateLimitHeaders,
} = vi.hoisted(() => ({
  mockRecord: vi.fn(),
  mockCaptureError: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCreateRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/rate-limit', () => ({
  apiLimiter: { limit: mockRateLimit },
  createRateLimitHeaders: mockCreateRateLimitHeaders,
  getClientIP: () => '203.0.113.10',
}));
vi.mock('@/lib/analytics/help-center.server', () => ({
  HelpCenterStoreUnavailableError: class extends Error {},
  recordHelpCenterEvents: mockRecord,
}));

import { OPTIONS, POST } from './route';

const VALID_EVENT = {
  schema_version: 1,
  event_id: 'opaque-help-id-1234:article_feedback',
  event: 'article_feedback',
  article_id: 'features/tips',
  feedback: 'not_helpful',
  feedback_reason: 'missing_info',
  source_surface: 'article',
  signed_in: 'signed_out',
  viewport_class: 'md',
};

function post(body: unknown, origin?: string): Request {
  const headers: Record<string, string> = {
    'content-type': 'text/plain;charset=UTF-8',
  };
  if (origin) headers.origin = origin;
  return new Request('https://jov.ie/api/analytics/help-center', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('/api/analytics/help-center POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    mockCreateRateLimitHeaders.mockReturnValue({});
    mockRecord.mockResolvedValue({ accepted: 1, duplicates: 0 });
  });

  it('accepts a valid beacon event from the docs origin', async () => {
    const response = await POST(post(VALID_EVENT, 'https://docs.jov.ie'));
    expect(response.status).toBe(202);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://docs.jov.ie'
    );
    expect(mockRecord).toHaveBeenCalledWith([VALID_EVENT]);
  });

  it('rejects invalid events and prohibited fields', async () => {
    for (const body of [
      { event: 'nope' },
      { ...VALID_EVENT, raw_query: 'secret text', user_id: 'u1' },
    ]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
    }
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('rate limits abusive senders', async () => {
    mockRateLimit.mockResolvedValue({ success: false });
    const response = await POST(post(VALID_EVENT));
    expect(response.status).toBe(429);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('does not leak CORS headers to disallowed origins', async () => {
    const response = await POST(post(VALID_EVENT, 'https://evil.example'));
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('/api/analytics/help-center OPTIONS', () => {
  it('answers preflight for allowed origins only', () => {
    const options = (origin: string) =>
      OPTIONS(
        new Request('https://jov.ie/api/analytics/help-center', {
          method: 'OPTIONS',
          headers: { origin },
        })
      );
    expect(
      options('https://docs.jov.ie').headers.get('access-control-allow-origin')
    ).toBe('https://docs.jov.ie');
    expect(
      options('https://evil.example').headers.get('access-control-allow-origin')
    ).toBeNull();
  });
});
