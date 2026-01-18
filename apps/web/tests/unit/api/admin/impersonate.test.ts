import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());
const mockStartImpersonation = vi.hoisted(() => vi.fn());
const mockEndImpersonation = vi.hoisted(() => vi.fn());
const mockGetImpersonationState = vi.hoisted(() => vi.fn());
const mockGetImpersonationTimeRemaining = vi.hoisted(() => vi.fn());
const mockIsImpersonationEnabled = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/admin', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/admin/impersonation', () => ({
  startImpersonation: mockStartImpersonation,
  endImpersonation: mockEndImpersonation,
  getImpersonationState: mockGetImpersonationState,
  getImpersonationTimeRemaining: mockGetImpersonationTimeRemaining,
  isImpersonationEnabled: mockIsImpersonationEnabled,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(null),
  }),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
}));

describe('Admin Impersonate API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Set up default auth mock to return proper structure
    mockAuth.mockResolvedValue({ userId: 'admin-123', sessionClaims: {} });
  });

  describe('GET /api/admin/impersonate', () => {
    it('returns 401 when not admin', async () => {
      const { NextResponse } = await import('next/server');
      mockRequireAdmin.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { GET } = await import('@/app/api/admin/impersonate/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns disabled status when impersonation is disabled', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockIsImpersonationEnabled.mockReturnValue(false);

      const { GET } = await import('@/app/api/admin/impersonate/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.enabled).toBe(false);
      expect(data.isImpersonating).toBe(false);
    });

    it('returns not impersonating when no active session', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockIsImpersonationEnabled.mockReturnValue(true);
      mockGetImpersonationState.mockResolvedValue(null);
      mockGetImpersonationTimeRemaining.mockResolvedValue(0);

      const { GET } = await import('@/app/api/admin/impersonate/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.enabled).toBe(true);
      expect(data.isImpersonating).toBe(false);
    });

    it('returns active impersonation state', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockIsImpersonationEnabled.mockReturnValue(true);
      mockGetImpersonationState.mockResolvedValue({
        realAdminClerkId: 'admin-clerk-id',
        effectiveClerkId: 'target-clerk-id',
        effectiveDbId: 'target-db-id',
        issuedAt: Date.now() - 5 * 60 * 1000,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      mockGetImpersonationTimeRemaining.mockResolvedValue(10 * 60 * 1000);

      const { GET } = await import('@/app/api/admin/impersonate/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.enabled).toBe(true);
      expect(data.isImpersonating).toBe(true);
      expect(data.effectiveClerkId).toBe('target-clerk-id');
      expect(data.timeRemainingMinutes).toBe(10);
    });
  });

  describe('POST /api/admin/impersonate', () => {
    it('returns 401 when not admin', async () => {
      const { NextResponse } = await import('next/server');
      mockRequireAdmin.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { POST } = await import('@/app/api/admin/impersonate/route');
      const request = new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetClerkId: 'target-123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when impersonation is disabled', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockIsImpersonationEnabled.mockReturnValue(false);

      const { POST } = await import('@/app/api/admin/impersonate/route');
      const request = new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetClerkId: 'target-123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Impersonation is disabled');
    });

    it('returns 400 for invalid request body', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockIsImpersonationEnabled.mockReturnValue(true);

      const { POST } = await import('@/app/api/admin/impersonate/route');
      const request = new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetClerkId: '' }), // Empty string
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    }, 10000);

    it('returns 401 when not authenticated', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockIsImpersonationEnabled.mockReturnValue(true);
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/admin/impersonate/route');
      const request = new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetClerkId: 'target-123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('returns 400 when impersonation fails', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockIsImpersonationEnabled.mockReturnValue(true);
      mockAuth.mockResolvedValue({ userId: 'admin-123' });
      mockStartImpersonation.mockResolvedValue({
        success: false,
        error: 'Target user not found',
      });

      const { POST } = await import('@/app/api/admin/impersonate/route');
      const request = new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetClerkId: 'target-123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Target user not found');
    });

    it('starts impersonation successfully', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockIsImpersonationEnabled.mockReturnValue(true);
      mockAuth.mockResolvedValue({ userId: 'admin-123' });
      mockStartImpersonation.mockResolvedValue({ success: true });

      const { POST } = await import('@/app/api/admin/impersonate/route');
      const request = new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetClerkId: 'target-123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.targetClerkId).toBe('target-123');
      expect(data.expiresInMinutes).toBe(15);
    });
  });

  describe('DELETE /api/admin/impersonate', () => {
    it('returns 401 when not admin', async () => {
      const { NextResponse } = await import('next/server');
      mockRequireAdmin.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { DELETE } = await import('@/app/api/admin/impersonate/route');
      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('ends impersonation successfully', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockEndImpersonation.mockResolvedValue({ success: true });

      const { DELETE } = await import('@/app/api/admin/impersonate/route');
      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Impersonation session ended');
    });

    it('returns 500 when ending impersonation fails', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockEndImpersonation.mockResolvedValue({ success: false });

      const { DELETE } = await import('@/app/api/admin/impersonate/route');
      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to end impersonation');
    });
  });
});
