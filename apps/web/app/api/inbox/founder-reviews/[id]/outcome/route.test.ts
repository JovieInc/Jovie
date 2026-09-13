import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireAuth: vi.fn(),
  updateOutcome: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@/lib/hud/require-admin-hud-api', () => ({
  requireAdminHudApiAccess: hoisted.requireAdmin,
}));

vi.mock('@/lib/founder-review/server', () => ({
  updateFounderReviewActionOutcome: hoisted.updateOutcome,
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { PATCH } = await import('./route');
const params = { params: Promise.resolve({ id: 'review-1' }) };

describe('founder review canonical action outcome route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdmin.mockResolvedValue(null);
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
    hoisted.updateOutcome.mockResolvedValue({
      id: 'review-1',
      actionOutcome: { status: 'applied' },
    });
  });

  it('denies customer-role outcome updates before reading the receipt', async () => {
    hoisted.requireAdmin.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    );

    const response = await PATCH(
      new Request('https://jov.ie/api/inbox/founder-reviews/review-1/outcome', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'applied', errorCode: null }),
      }),
      params
    );

    expect(response.status).toBe(403);
    expect(hoisted.requireAuth).not.toHaveBeenCalled();
    expect(hoisted.updateOutcome).not.toHaveBeenCalled();
  });

  it('persists an authenticated applied outcome', async () => {
    const response = await PATCH(
      new Request('https://jov.ie/api/inbox/founder-reviews/review-1/outcome', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'applied', errorCode: null }),
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(hoisted.updateOutcome).toHaveBeenCalledWith({
      id: 'review-1',
      userIdentity: 'user-1',
      status: 'applied',
      errorCode: null,
    });
  });

  it('rejects arbitrary outcome values', async () => {
    const response = await PATCH(
      new Request('https://jov.ie/api/inbox/founder-reviews/review-1/outcome', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'invented' }),
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(hoisted.updateOutcome).not.toHaveBeenCalled();
  });
});
