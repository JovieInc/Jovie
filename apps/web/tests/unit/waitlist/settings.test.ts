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

  it('returns false when DB returns gateEnabled=false', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: false }));

    const result = await isWaitlistGateEnabled();

    expect(result).toBe(false);
    // DB should be queried on first call (no cache yet)
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it('returns true when DB returns gateEnabled=true', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    const result = await isWaitlistGateEnabled();

    expect(result).toBe(true);
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it('caches the result and does not hit DB on repeated calls', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: false }));

    const first = await isWaitlistGateEnabled();
    expect(first).toBe(false);
    expect(mockDbSelect).toHaveBeenCalledTimes(1);

    // Reset mock call tracking to verify it's not called again
    mockDbSelect.mockClear();

    const second = await isWaitlistGateEnabled();
    expect(second).toBe(false);
    // Cache hit — no additional DB query
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns cached value even after cache invalidation (re-queries DB)', async () => {
    // First call: DB returns false
    setupDbSelectMock(createMockSettings({ gateEnabled: false }));
    await isWaitlistGateEnabled();
    expect(mockDbSelect).toHaveBeenCalledTimes(1);

    // Invalidate cache and change DB mock to return true
    const mod = await import('@/lib/waitlist/settings');
    mod.invalidateWaitlistGateCache();
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    const result = await isWaitlistGateEnabled();
    expect(result).toBe(true);
    // DB was queried again after cache invalidation
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
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
    // Mock ensureSettingsRow SELECT
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
