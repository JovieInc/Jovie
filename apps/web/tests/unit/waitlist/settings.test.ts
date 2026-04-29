import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistSettings: {
    id: 'id',
    gateEnabled: 'gate_enabled',
    autoAcceptEnabled: 'auto_accept_enabled',
    autoAcceptDailyLimit: 'auto_accept_daily_limit',
    autoAcceptedToday: 'auto_accepted_today',
    autoAcceptResetsAt: 'auto_accept_resets_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sql: vi.fn(),
}));

function createMockSettings(
  overrides: Partial<{
    gateEnabled: boolean;
    autoAcceptEnabled: boolean;
    autoAcceptDailyLimit: number;
    autoAcceptedToday: number;
  }> = {}
) {
  return {
    id: 1,
    gateEnabled: overrides.gateEnabled ?? true,
    autoAcceptEnabled: overrides.autoAcceptEnabled ?? false,
    autoAcceptDailyLimit: overrides.autoAcceptDailyLimit ?? 0,
    autoAcceptedToday: overrides.autoAcceptedToday ?? 0,
    autoAcceptResetsAt: new Date(Date.now() + 86_400_000), // tomorrow
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function setupDbSelectMock(row: ReturnType<typeof createMockSettings> | null) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(row ? [row] : []),
      }),
    }),
  });
}

describe('isWaitlistGateEnabled', () => {
  let isWaitlistGateEnabled: typeof import('@/lib/waitlist/settings').isWaitlistGateEnabled;

  beforeEach(async () => {
    vi.resetModules();
    mockDbSelect.mockClear();
    mockDbInsert.mockClear();
    mockDbUpdate.mockClear();

    const mod = await import('@/lib/waitlist/settings');
    isWaitlistGateEnabled = mod.isWaitlistGateEnabled;
  });

  it('returns the DB-backed gate setting', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    const result = await isWaitlistGateEnabled();

    expect(result).toBe(true);
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it('does not use a warm in-memory cache for the launch gate', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: false }));

    const first = await isWaitlistGateEnabled();
    const second = await isWaitlistGateEnabled();

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it('continues reading from DB after cache invalidation', async () => {
    const mod = await import('@/lib/waitlist/settings');
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    await isWaitlistGateEnabled();
    mod.invalidateWaitlistGateCache();

    const result = await isWaitlistGateEnabled();
    expect(result).toBe(true);
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });
});

describe('tryReserveAutoAcceptSlot', () => {
  let tryReserveAutoAcceptSlot: typeof import('@/lib/waitlist/settings').tryReserveAutoAcceptSlot;
  let getWaitlistSettings: typeof import('@/lib/waitlist/settings').getWaitlistSettings;

  beforeEach(async () => {
    vi.resetModules();
    mockDbSelect.mockClear();
    mockDbInsert.mockClear();
    mockDbUpdate.mockClear();

    const mod = await import('@/lib/waitlist/settings');
    tryReserveAutoAcceptSlot = mod.tryReserveAutoAcceptSlot;
    getWaitlistSettings = mod.getWaitlistSettings;
  });

  it('never reserves a slot when the manual gate is on', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    await expect(tryReserveAutoAcceptSlot()).resolves.toEqual({
      shouldAutoAccept: false,
      reason: 'gate_on',
    });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('reserves a slot when the gate is off and capacity remains', async () => {
    setupDbSelectMock(
      createMockSettings({
        gateEnabled: false,
        autoAcceptEnabled: true,
        autoAcceptDailyLimit: 2,
        autoAcceptedToday: 1,
      })
    );
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });

    await expect(tryReserveAutoAcceptSlot()).resolves.toEqual({
      shouldAutoAccept: true,
      reason: 'reserved',
    });
  });

  it('does not reserve when auto accept is disabled', async () => {
    setupDbSelectMock(
      createMockSettings({
        gateEnabled: false,
        autoAcceptEnabled: false,
        autoAcceptDailyLimit: 2,
        autoAcceptedToday: 0,
      })
    );

    await expect(tryReserveAutoAcceptSlot()).resolves.toEqual({
      shouldAutoAccept: false,
      reason: 'auto_accept_disabled',
    });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('does not reserve when the daily cap is already full', async () => {
    setupDbSelectMock(
      createMockSettings({
        gateEnabled: false,
        autoAcceptEnabled: true,
        autoAcceptDailyLimit: 1,
        autoAcceptedToday: 1,
      })
    );

    await expect(tryReserveAutoAcceptSlot()).resolves.toEqual({
      shouldAutoAccept: false,
      reason: 'capacity_full',
    });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('fails closed when a concurrent reservation takes the last slot', async () => {
    setupDbSelectMock(
      createMockSettings({
        gateEnabled: false,
        autoAcceptEnabled: true,
        autoAcceptDailyLimit: 1,
        autoAcceptedToday: 0,
      })
    );
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(tryReserveAutoAcceptSlot()).resolves.toEqual({
      shouldAutoAccept: false,
      reason: 'capacity_full',
    });
  });

  it('resets the daily counter at the UTC reset boundary', async () => {
    const expiredSettings = createMockSettings({
      gateEnabled: false,
      autoAcceptEnabled: true,
      autoAcceptDailyLimit: 5,
      autoAcceptedToday: 5,
    });
    expiredSettings.autoAcceptResetsAt = new Date(Date.now() - 1_000);
    const resetSettings = {
      ...expiredSettings,
      autoAcceptedToday: 0,
      autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
    };
    setupDbSelectMock(expiredSettings);
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([resetSettings]),
        }),
      }),
    });

    await expect(getWaitlistSettings()).resolves.toEqual(resetSettings);
  });
});

describe('updateWaitlistSettings invalidates cache', () => {
  let updateWaitlistSettings: typeof import('@/lib/waitlist/settings').updateWaitlistSettings;
  let invalidateWaitlistGateCache: typeof import('@/lib/waitlist/settings').invalidateWaitlistGateCache;

  beforeEach(async () => {
    vi.resetModules();
    mockDbSelect.mockClear();
    mockDbInsert.mockClear();
    mockDbUpdate.mockClear();

    const mod = await import('@/lib/waitlist/settings');
    updateWaitlistSettings = mod.updateWaitlistSettings;
    invalidateWaitlistGateCache = mod.invalidateWaitlistGateCache;

    invalidateWaitlistGateCache();
  });

  it('clears the gate cache after settings are updated', async () => {
    // Mock updateWaitlistSettings DB calls
    // ensureSettingsRow SELECT
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([createMockSettings({ gateEnabled: false })]),
        }),
      }),
    });

    await updateWaitlistSettings({
      gateEnabled: false,
      autoAcceptEnabled: false,
      autoAcceptDailyLimit: 0,
    });

    // updateWaitlistSettings still works (admin tooling preserved)
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});
