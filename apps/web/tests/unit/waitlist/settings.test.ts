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

  it('always returns false (gate permanently disabled)', async () => {
    // Even with DB mock returning gateEnabled: true, the function returns false
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    const result = await isWaitlistGateEnabled();

    expect(result).toBe(false);
    // No DB query should be made — function short-circuits
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns false on repeated calls without hitting DB', async () => {
    const first = await isWaitlistGateEnabled();
    const second = await isWaitlistGateEnabled();

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns false regardless of cache invalidation', async () => {
    const mod = await import('@/lib/waitlist/settings');

    await isWaitlistGateEnabled();
    mod.invalidateWaitlistGateCache();

    const result = await isWaitlistGateEnabled();
    expect(result).toBe(false);
    expect(mockDbSelect).not.toHaveBeenCalled();
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
