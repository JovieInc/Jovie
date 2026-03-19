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
  let invalidateWaitlistGateCache: typeof import('@/lib/waitlist/settings').invalidateWaitlistGateCache;

  beforeEach(async () => {
    vi.resetModules();
    mockDbSelect.mockClear();
    mockDbInsert.mockClear();
    mockDbUpdate.mockClear();

    const mod = await import('@/lib/waitlist/settings');
    isWaitlistGateEnabled = mod.isWaitlistGateEnabled;
    invalidateWaitlistGateCache = mod.invalidateWaitlistGateCache;

    // Always start with a clean cache
    invalidateWaitlistGateCache();
  });

  it('queries DB on cache miss and returns gateEnabled value', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    const result = await isWaitlistGateEnabled();

    expect(result).toBe(true);
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
  });

  it('returns cached value on cache hit (no extra DB query)', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: false }));

    const first = await isWaitlistGateEnabled();
    const second = await isWaitlistGateEnabled();

    expect(first).toBe(false);
    expect(second).toBe(false);
    // Only 1 DB query — second call used cache
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
  });

  it('queries DB again after cache is invalidated', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    await isWaitlistGateEnabled();
    expect(mockDbSelect).toHaveBeenCalledTimes(1);

    // Invalidate and change the mock to return false
    invalidateWaitlistGateCache();
    setupDbSelectMock(createMockSettings({ gateEnabled: false }));

    const result = await isWaitlistGateEnabled();
    expect(result).toBe(false);
    // Second DB query after invalidation
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });
});

describe('updateWaitlistSettings invalidates cache', () => {
  let isWaitlistGateEnabled: typeof import('@/lib/waitlist/settings').isWaitlistGateEnabled;
  let updateWaitlistSettings: typeof import('@/lib/waitlist/settings').updateWaitlistSettings;
  let invalidateWaitlistGateCache: typeof import('@/lib/waitlist/settings').invalidateWaitlistGateCache;

  beforeEach(async () => {
    vi.resetModules();
    mockDbSelect.mockClear();
    mockDbInsert.mockClear();
    mockDbUpdate.mockClear();

    const mod = await import('@/lib/waitlist/settings');
    isWaitlistGateEnabled = mod.isWaitlistGateEnabled;
    updateWaitlistSettings = mod.updateWaitlistSettings;
    invalidateWaitlistGateCache = mod.invalidateWaitlistGateCache;

    invalidateWaitlistGateCache();
  });

  it('clears the gate cache after settings are updated', async () => {
    // Populate cache with gateEnabled=true
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));
    await isWaitlistGateEnabled();
    expect(mockDbSelect).toHaveBeenCalledTimes(1);

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

    // Now re-query — cache should be cleared, so a fresh DB call happens
    setupDbSelectMock(createMockSettings({ gateEnabled: false }));
    const result = await isWaitlistGateEnabled();
    expect(result).toBe(false);
  });
});
