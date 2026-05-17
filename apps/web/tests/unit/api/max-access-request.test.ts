import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  eqMock: vi.fn(() => 'where-clause'),
  requireAuthMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  selectFromMock: vi.fn(),
  selectWhereMock: vi.fn(),
  selectLimitMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  notifySlackGrowthRequestMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: hoisted.eqMock,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuthMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: hoisted.selectFromMock,
    })),
    update: vi.fn(() => ({
      set: hoisted.updateSetMock,
    })),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    name: 'name',
    email: 'email',
    plan: 'plan',
    clerkId: 'clerkId',
    growthAccessRequestedAt: 'growthAccessRequestedAt',
  },
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackGrowthRequest: hoisted.notifySlackGrowthRequestMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: hoisted.loggerInfoMock,
    error: hoisted.loggerErrorMock,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/max-access-request', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/max-access-request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    hoisted.requireAuthMock.mockResolvedValue({
      userId: 'clerk_123',
      error: null,
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      hasAdvancedFeatures: false,
    });
    hoisted.selectFromMock.mockReturnValue({
      where: hoisted.selectWhereMock,
    });
    hoisted.selectWhereMock.mockReturnValue({
      limit: hoisted.selectLimitMock,
    });
    hoisted.selectLimitMock.mockResolvedValue([
      {
        id: 'user_123',
        name: 'Test Artist',
        email: 'artist@example.com',
        plan: 'pro',
        growthAccessRequestedAt: null,
      },
    ]);
    hoisted.updateSetMock.mockReturnValue({
      where: hoisted.updateWhereMock,
    });
    hoisted.updateWhereMock.mockResolvedValue(undefined);
    hoisted.notifySlackGrowthRequestMock.mockResolvedValue(undefined);
  });

  it('blocks users who already have Max-level entitlements', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      hasAdvancedFeatures: true,
    });

    const { POST } = await import('@/app/api/max-access-request/route');
    const response = await POST(makeRequest({ reason: 'Need API access' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'You already have Max access',
    });
    expect(hoisted.getCurrentUserEntitlementsMock).toHaveBeenCalledOnce();
    expect(hoisted.updateSetMock).not.toHaveBeenCalled();
    expect(hoisted.notifySlackGrowthRequestMock).not.toHaveBeenCalled();
  });

  it('stores a request for authenticated users without Max-level entitlements', async () => {
    const { POST } = await import('@/app/api/max-access-request/route');
    const response = await POST(makeRequest({ reason: 'Need API access' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(hoisted.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        growthAccessReason: 'Need API access',
      })
    );
    expect(hoisted.notifySlackGrowthRequestMock).toHaveBeenCalledWith(
      'Test Artist',
      'artist@example.com',
      'pro',
      'Need API access'
    );
  });
});
