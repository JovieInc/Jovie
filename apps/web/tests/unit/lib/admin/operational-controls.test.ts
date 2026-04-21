import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() =>
  vi.fn(() => ({
    limit: mockLimit,
  }))
);
const mockFrom = vi.hoisted(() =>
  vi.fn(() => ({
    where: mockWhere,
  }))
);
const mockSelect = vi.hoisted(() =>
  vi.fn(() => ({
    from: mockFrom,
  }))
);
const mockInsert = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock('@/lib/db/schema/admin', () => ({
  adminSystemSettings: {
    id: 'id',
    signupEnabled: 'signupEnabled',
    checkoutEnabled: 'checkoutEnabled',
    stripeWebhooksEnabled: 'stripeWebhooksEnabled',
    cronFanoutEnabled: 'cronFanoutEnabled',
    operationalControlsUpdatedAt: 'operationalControlsUpdatedAt',
    operationalControlsUpdatedBy: 'operationalControlsUpdatedBy',
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerkId',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(),
}));

describe('getOperationalControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockLimit.mockRejectedValue(
      new Error('column "signup_enabled" does not exist')
    );
  });

  it('fails closed when the backing settings cannot be read', async () => {
    const { getOperationalControls, invalidateOperationalControlsCache } =
      await import('@/lib/admin/operational-controls');

    invalidateOperationalControlsCache();

    await expect(getOperationalControls()).resolves.toEqual({
      signupEnabled: false,
      checkoutEnabled: false,
      stripeWebhooksEnabled: false,
      cronFanoutEnabled: false,
      updatedAt: null,
      updatedByUserId: null,
    });
  });

  it('throws in strict mode when the backing settings cannot be read', async () => {
    const { getOperationalControls, invalidateOperationalControlsCache } =
      await import('@/lib/admin/operational-controls');

    invalidateOperationalControlsCache();

    await expect(getOperationalControls({ strict: true })).rejects.toThrowError(
      'column "signup_enabled" does not exist'
    );
  });

  it('stores the database user id when updating controls', async () => {
    const currentRow = {
      id: 1,
      signupEnabled: true,
      checkoutEnabled: true,
      stripeWebhooksEnabled: true,
      cronFanoutEnabled: true,
      operationalControlsUpdatedAt: null,
      operationalControlsUpdatedBy: null,
    };
    const updatedAt = new Date('2026-04-18T23:30:00.000Z');
    const updatedRow = {
      ...currentRow,
      signupEnabled: false,
      operationalControlsUpdatedAt: updatedAt,
      operationalControlsUpdatedBy: 'db-user-123',
    };

    mockLimit
      .mockResolvedValueOnce([currentRow])
      .mockResolvedValueOnce([{ id: 'db-user-123' }]);

    const mockReturning = vi.fn().mockResolvedValue([updatedRow]);
    const mockOnConflictDoUpdate = vi.fn().mockReturnValue({
      returning: mockReturning,
    });
    const mockValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: mockOnConflictDoUpdate,
    });
    mockInsert.mockReturnValue({
      values: mockValues,
    });

    const { invalidateOperationalControlsCache, updateOperationalControls } =
      await import('@/lib/admin/operational-controls');

    invalidateOperationalControlsCache();

    await expect(
      updateOperationalControls({ signupEnabled: false }, 'user_clerk_123')
    ).resolves.toEqual({
      signupEnabled: false,
      checkoutEnabled: true,
      stripeWebhooksEnabled: true,
      cronFanoutEnabled: true,
      updatedAt,
      updatedByUserId: 'db-user-123',
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        operationalControlsUpdatedBy: 'db-user-123',
      })
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          operationalControlsUpdatedBy: 'db-user-123',
        }),
      })
    );
  });
});
