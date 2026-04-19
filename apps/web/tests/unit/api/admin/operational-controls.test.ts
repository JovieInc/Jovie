import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetOptionalAuth = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => vi.fn());
const mockGetOperationalControls = vi.hoisted(() => vi.fn());
const mockUpdateOperationalControls = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/admin/operational-controls', () => ({
  getOperationalControls: mockGetOperationalControls,
  updateOperationalControls: mockUpdateOperationalControls,
  OPERATIONAL_CONTROL_KEYS: [
    'signupEnabled',
    'checkoutEnabled',
    'stripeWebhooksEnabled',
    'cronFanoutEnabled',
  ],
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('admin operational controls route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetOptionalAuth.mockResolvedValue({
      userId: 'user_123',
      sessionId: 'sess_123',
      orgId: null,
    });
    mockIsAdmin.mockResolvedValue(true);
    mockGetOperationalControls.mockResolvedValue({
      signupEnabled: true,
      checkoutEnabled: true,
      stripeWebhooksEnabled: true,
      cronFanoutEnabled: true,
      updatedAt: new Date('2026-04-18T20:00:00.000Z'),
      updatedByUserId: 'user_123',
    });
    mockUpdateOperationalControls.mockResolvedValue({
      signupEnabled: false,
      checkoutEnabled: true,
      stripeWebhooksEnabled: true,
      cronFanoutEnabled: true,
      updatedAt: new Date('2026-04-18T20:05:00.000Z'),
      updatedByUserId: 'user_123',
    });
  });

  it('returns 401 when signed out', async () => {
    mockGetOptionalAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    const { GET } = await import('@/app/api/admin/operational-controls/route');
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when the user is not admin', async () => {
    mockIsAdmin.mockResolvedValue(false);

    const { GET } = await import('@/app/api/admin/operational-controls/route');
    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('loads controls in strict mode for admins', async () => {
    const { GET } = await import('@/app/api/admin/operational-controls/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetOperationalControls).toHaveBeenCalledWith({ strict: true });
    expect(await response.json()).toEqual({
      ok: true,
      controls: {
        signupEnabled: true,
        checkoutEnabled: true,
        stripeWebhooksEnabled: true,
        cronFanoutEnabled: true,
        updatedAt: '2026-04-18T20:00:00.000Z',
        updatedByUserId: 'user_123',
      },
    });
  });

  it('returns 500 when controls cannot be loaded', async () => {
    mockGetOperationalControls.mockRejectedValue(new Error('db exploded'));

    const { GET } = await import('@/app/api/admin/operational-controls/route');
    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to fetch operational controls',
    });
  });

  it('updates controls for admins', async () => {
    const { PATCH } = await import(
      '@/app/api/admin/operational-controls/route'
    );
    const request = new NextRequest(
      'http://localhost/api/admin/operational-controls',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupEnabled: false }),
      }
    );

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(mockUpdateOperationalControls).toHaveBeenCalledWith(
      { signupEnabled: false },
      'user_123'
    );
    expect(await response.json()).toEqual({
      ok: true,
      controls: {
        signupEnabled: false,
        checkoutEnabled: true,
        stripeWebhooksEnabled: true,
        cronFanoutEnabled: true,
        updatedAt: '2026-04-18T20:05:00.000Z',
        updatedByUserId: 'user_123',
      },
    });
  });

  it('returns 401 on PATCH when signed out', async () => {
    mockGetOptionalAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    const { PATCH } = await import(
      '@/app/api/admin/operational-controls/route'
    );
    const request = new NextRequest(
      'http://localhost/api/admin/operational-controls',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupEnabled: false }),
      }
    );

    const response = await PATCH(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockUpdateOperationalControls).not.toHaveBeenCalled();
  });

  it('returns 403 on PATCH when the user is not admin', async () => {
    mockIsAdmin.mockResolvedValue(false);

    const { PATCH } = await import(
      '@/app/api/admin/operational-controls/route'
    );
    const request = new NextRequest(
      'http://localhost/api/admin/operational-controls',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupEnabled: false }),
      }
    );

    const response = await PATCH(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(mockUpdateOperationalControls).not.toHaveBeenCalled();
  });

  it('returns 400 on PATCH when the body contains unknown keys', async () => {
    const { PATCH } = await import(
      '@/app/api/admin/operational-controls/route'
    );
    const request = new NextRequest(
      'http://localhost/api/admin/operational-controls',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupEnable: false }),
      }
    );

    const response = await PATCH(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Unknown operational control: signupEnable',
    });
    expect(mockUpdateOperationalControls).not.toHaveBeenCalled();
  });

  it('returns 400 on PATCH when a control value is malformed', async () => {
    const { PATCH } = await import(
      '@/app/api/admin/operational-controls/route'
    );
    const request = new NextRequest(
      'http://localhost/api/admin/operational-controls',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupEnabled: 'nope' }),
      }
    );

    const response = await PATCH(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'signupEnabled must be a boolean',
    });
    expect(mockUpdateOperationalControls).not.toHaveBeenCalled();
  });
});
