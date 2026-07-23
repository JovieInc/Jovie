import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCachedAuth,
  mockRequireAdmin,
  mockRecord,
  mockGetBaseline,
  mockCaptureError,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockRecord: vi.fn(),
  mockGetBaseline: vi.fn(),
  mockCaptureError: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockGetCachedAuth }));
vi.mock('@/lib/admin', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/analytics/navigation-telemetry.server', () => ({
  NavigationTelemetryStoreUnavailableError: class extends Error {},
  recordNavigationTelemetry: mockRecord,
  getNavigationTelemetryBaseline: mockGetBaseline,
}));

import { NavigationTelemetryStoreUnavailableError } from '@/lib/analytics/navigation-telemetry.server';
import { GET, POST } from './route';

const VALID_PAYLOAD = {
  schema_version: 1,
  event_id: 'opaque-navigation-id:activation',
  event: 'activation',
  item_id: 'library',
  source_route: 'chat',
  destination_route: 'library',
  input_method: 'pointer',
  platform: 'web_desktop',
  nav_variant: 'canonical_customer_ia_v1',
  consent_mode: 'explicit',
  latency_bucket: 'na',
  success: false,
};

function post(body: unknown): Request {
  return new Request('https://jov.ie/api/analytics/navigation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/analytics/navigation', () => {
  beforeEach(() => {
    mockGetCachedAuth.mockReset();
    mockRequireAdmin.mockReset();
    mockRecord.mockReset().mockResolvedValue({ status: 'accepted' });
    mockGetBaseline.mockReset();
    mockCaptureError.mockReset();
  });

  it('rejects unauthenticated writes before parsing', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });
    expect((await POST(post(VALID_PAYLOAD))).status).toBe(401);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('rejects raw identity or content fields', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    expect(
      (await POST(post({ ...VALID_PAYLOAD, user_id: 'must-not-survive' })))
        .status
    ).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('discards authentication identity before the aggregate sink', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    expect((await POST(post(VALID_PAYLOAD))).status).toBe(204);
    expect(mockRecord).toHaveBeenCalledExactlyOnceWith(VALID_PAYLOAD);
    expect(JSON.stringify(mockRecord.mock.calls)).not.toContain(
      'discarded-auth-id'
    );
  });

  it('fails closed without error capture when the aggregate store is unavailable', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    mockRecord.mockRejectedValue(
      new NavigationTelemetryStoreUnavailableError()
    );

    expect((await POST(post(VALID_PAYLOAD))).status).toBe(503);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('captures unexpected write failures without payload or identity context', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    const failure = new Error('aggregate failure');
    mockRecord.mockRejectedValue(failure);

    expect((await POST(post(VALID_PAYLOAD))).status).toBe(503);
    expect(mockCaptureError).toHaveBeenCalledExactlyOnceWith(
      'Navigation telemetry aggregate write failed',
      failure,
      { route: '/api/analytics/navigation', method: 'POST' }
    );
    expect(JSON.stringify(mockCaptureError.mock.calls)).not.toContain(
      'discarded-auth-id'
    );
  });

  it('does not query the baseline when admin authorization denies access', async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: 'Forbidden' }, { status: 403 })
    );

    expect((await GET()).status).toBe(403);
    expect(mockGetBaseline).not.toHaveBeenCalled();
  });

  it('requires admin access and returns a no-store aggregate baseline', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockGetBaseline.mockResolvedValue({ published: false, segments: [] });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ published: false, segments: [] });
  });

  it('captures unexpected baseline failures and returns unavailable', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const failure = new Error('read failure');
    mockGetBaseline.mockRejectedValue(failure);

    expect((await GET()).status).toBe(503);
    expect(mockCaptureError).toHaveBeenCalledExactlyOnceWith(
      'Navigation telemetry baseline read failed',
      failure,
      { route: '/api/analytics/navigation', method: 'GET' }
    );
  });
});
