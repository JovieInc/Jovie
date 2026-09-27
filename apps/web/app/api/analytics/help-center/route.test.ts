import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRequireAdmin,
  mockRecord,
  mockGetSignals,
  mockCaptureError,
  mockRateLimit,
  mockCreateRateLimitHeaders,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRecord: vi.fn(),
  mockGetSignals: vi.fn(),
  mockCaptureError: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCreateRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/admin', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/rate-limit', () => ({
  apiLimiter: { limit: mockRateLimit },
  createRateLimitHeaders: mockCreateRateLimitHeaders,
  getClientIP: () => '203.0.113.10',
}));
vi.mock('@/lib/analytics/help-center.server', () => ({
  HelpCenterStoreUnavailableError: class extends Error {},
  recordHelpCenterEvents: mockRecord,
  getHelpCenterSignals: mockGetSignals,
}));

import { GET, OPTIONS, POST } from './route';

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

  it('rejects invalid events', async () => {
    const response = await POST(post({ event: 'nope' }));
    expect(response.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('rejects payloads containing prohibited fields', async () => {
    const response = await POST(
      post({ ...VALID_EVENT, raw_query: 'secret text', user_id: 'u1' })
    );
    expect(response.status).toBe(400);
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
    const allowed = OPTIONS(
      new Request('https://jov.ie/api/analytics/help-center', {
        method: 'OPTIONS',
        headers: { origin: 'https://docs.jov.ie' },
      })
    );
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://docs.jov.ie'
    );

    const denied = OPTIONS(
      new Request('https://jov.ie/api/analytics/help-center', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      })
    );
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('/api/analytics/help-center GET', () => {
  it('requires admin and returns the four closed-loop views', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockGetSignals.mockResolvedValue({
      top_queries: [],
      zero_result_queries: [],
      article_helpfulness: [],
      escalations: [],
      remediation_candidates: [],
    });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('top_queries');
    expect(body).toHaveProperty('zero_result_queries');
    expect(body).toHaveProperty('article_helpfulness');
    expect(body).toHaveProperty('escalations');
    expect(body).toHaveProperty('remediation_candidates');
  });

  it('blocks non-admin reads', async () => {
    mockRequireAdmin.mockResolvedValue(
      new Response('forbidden', { status: 403 })
    );
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mockGetSignals).not.toHaveBeenCalled();
  });
});
