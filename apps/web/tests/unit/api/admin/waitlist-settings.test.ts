import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockGetWaitlistSettings = vi.hoisted(() => vi.fn());
const mockUpdateWaitlistSettings = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  getWaitlistSettings: mockGetWaitlistSettings,
  updateWaitlistSettings: mockUpdateWaitlistSettings,
}));

import { GET, PATCH } from '@/app/app/(shell)/admin/waitlist/settings/route';

describe('Admin waitlist settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com',
    });
    mockGetWaitlistSettings.mockResolvedValue({
      gateEnabled: true,
      autoAcceptEnabled: false,
      autoAcceptDailyLimit: 0,
      autoAcceptedToday: 0,
      autoAcceptResetsAt: new Date('2026-02-26T00:00:00Z'),
    });
    mockUpdateWaitlistSettings.mockResolvedValue({
      gateEnabled: true,
      autoAcceptEnabled: true,
      autoAcceptDailyLimit: 5,
      autoAcceptedToday: 1,
      autoAcceptResetsAt: new Date('2026-02-26T00:00:00Z'),
    });
  });

  it('returns settings for admins', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.settings.gateEnabled).toBe(true);
  });

  it('returns 500 instead of throwing when entitlements fail during GET', async () => {
    mockGetCurrentUserEntitlements.mockRejectedValueOnce(
      new Error('billing lookup failed')
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: 'Failed to load waitlist settings',
    });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Admin action failed: load waitlist settings',
      expect.any(Error),
      expect.objectContaining({
        action: 'load_waitlist_settings',
        route: '/app/admin/waitlist/settings',
        adminEmail: 'unknown',
      })
    );
  });

  it('updates settings with valid payload', async () => {
    const request = new Request(
      'http://localhost/app/admin/waitlist/settings',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateEnabled: true,
          autoAcceptEnabled: true,
          autoAcceptDailyLimit: 5,
        }),
      }
    );

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateWaitlistSettings).toHaveBeenCalledWith({
      gateEnabled: true,
      autoAcceptEnabled: true,
      autoAcceptDailyLimit: 5,
    });
  });

  it('returns 500 instead of throwing when entitlements fail during PATCH', async () => {
    mockGetCurrentUserEntitlements.mockRejectedValueOnce(
      new Error('billing lookup failed')
    );

    const request = new Request(
      'http://localhost/app/admin/waitlist/settings',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateEnabled: true,
          autoAcceptEnabled: true,
          autoAcceptDailyLimit: 5,
        }),
      }
    );

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: 'Failed to update waitlist settings',
    });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Admin action failed: update waitlist settings',
      expect.any(Error),
      expect.objectContaining({
        action: 'update_waitlist_settings',
        route: '/app/admin/waitlist/settings',
        adminEmail: 'unknown',
      })
    );
  });

  it('rejects invalid payload', async () => {
    const request = new Request(
      'http://localhost/app/admin/waitlist/settings',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateEnabled: true, autoAcceptDailyLimit: -1 }),
      }
    );

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });
});
