import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureWarning } from '@/lib/error-tracking';

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
    autoAcceptAfterDays: 'auto_accept_after_days',
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

// Mocks for the new Redis + observability layer in settings.ts (gate cache hardening).
// Redis returns null so tests exercise the mem-cache + DB fallback paths exactly
// as before; breadcrumbs and warnings are no-ops.
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(),
}));

function createMockSettings(
  overrides: Partial<{
    gateEnabled: boolean;
    autoAcceptEnabled: boolean;
    autoAcceptAfterDays: number;
    autoAcceptDailyLimit: number;
    autoAcceptedToday: number;
  }> = {}
) {
  return {
    id: 1,
    gateEnabled: overrides.gateEnabled ?? true,
    autoAcceptEnabled: overrides.autoAcceptEnabled ?? false,
    autoAcceptAfterDays: overrides.autoAcceptAfterDays ?? 7,
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

function setupDbSelectError(error: unknown) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(error),
      }),
    }),
  });
}

/**
 * Mirrors the prod migration-drift failure (JOV-3353): Drizzle wraps the PG
 * 42P01 (undefined_table) error, so the outer message is "Failed query: ..."
 * and the real error lives on `.cause`.
 */
function createMissingWaitlistSettingsError() {
  return new Error(
    'Failed query: select "id", "gate_enabled", "auto_accept_enabled", "auto_accept_after_days", "auto_accept_daily_limit", "auto_accepted_today", "auto_accept_resets_at", "created_at", "updated_at" from "waitlist_settings" where "waitlist_settings"."id" = $1 limit $2',
    {
      cause: {
        code: '42P01',
        message: 'relation "waitlist_settings" does not exist',
      },
    }
  );
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
    await mod.invalidateWaitlistGateCache();
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    const result = await isWaitlistGateEnabled();
    expect(result).toBe(true);
    // DB was queried again after cache invalidation
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

  it('does not reserve a slot when auto-accept is disabled', async () => {
    setupDbSelectMock(createMockSettings({ gateEnabled: true }));

    await expect(tryReserveAutoAcceptSlot()).resolves.toEqual({
      shouldAutoAccept: false,
      reason: 'auto_accept_disabled',
    });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('reserves capacity even when the gate is off', async () => {
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
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it('returns auto_accept_disabled when auto accept is disabled while gate is on', async () => {
    setupDbSelectMock(
      createMockSettings({
        gateEnabled: true,
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

  it('reserves a slot when the gate is on, auto accept is enabled, and capacity remains', async () => {
    setupDbSelectMock(
      createMockSettings({
        gateEnabled: true,
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

  it('does not reserve when the daily cap is already full', async () => {
    setupDbSelectMock(
      createMockSettings({
        gateEnabled: true,
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
        gateEnabled: true,
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

    await invalidateWaitlistGateCache();
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
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 0,
    });

    // updateWaitlistSettings still works (admin tooling preserved)
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});

describe('migration-drift fail-soft (JOV-3353)', () => {
  let isWaitlistGateEnabled: typeof import('@/lib/waitlist/settings').isWaitlistGateEnabled;
  let getWaitlistSettings: typeof import('@/lib/waitlist/settings').getWaitlistSettings;
  let isMissingWaitlistSettingsTableError: typeof import('@/lib/waitlist/settings').isMissingWaitlistSettingsTableError;

  beforeEach(async () => {
    vi.resetModules();
    mockDbSelect.mockClear();
    mockDbInsert.mockClear();
    mockDbUpdate.mockClear();
    vi.mocked(captureWarning).mockClear();

    const mod = await import('@/lib/waitlist/settings');
    isWaitlistGateEnabled = mod.isWaitlistGateEnabled;
    getWaitlistSettings = mod.getWaitlistSettings;
    isMissingWaitlistSettingsTableError =
      mod.isMissingWaitlistSettingsTableError;
  });

  it('matches only the missing waitlist_settings relation', () => {
    expect(
      isMissingWaitlistSettingsTableError(createMissingWaitlistSettingsError())
    ).toBe(true);
    expect(
      isMissingWaitlistSettingsTableError(
        new Error('relation "library_asset_approval_statuses" does not exist', {
          cause: { code: '42P01' },
        })
      )
    ).toBe(false);
    expect(isMissingWaitlistSettingsTableError(new Error('boom'))).toBe(false);
  });

  it('isWaitlistGateEnabled degrades to the documented default gate state with one warning when the relation is missing', async () => {
    setupDbSelectError(createMissingWaitlistSettingsError());

    // Documented default gate state (schema default) is gateEnabled=true.
    await expect(isWaitlistGateEnabled()).resolves.toBe(true);
    expect(captureWarning).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureWarning).mock.calls[0][0]).toContain(
      'waitlist_settings'
    );
  });

  it('getWaitlistSettings returns documented defaults without issuing writes when the relation is missing', async () => {
    setupDbSelectError(createMissingWaitlistSettingsError());

    const settings = await getWaitlistSettings();

    expect(settings.gateEnabled).toBe(true);
    expect(settings.autoAcceptEnabled).toBe(false);
    expect(settings.autoAcceptAfterDays).toBe(7);
    expect(settings.autoAcceptDailyLimit).toBe(0);
    expect(settings.autoAcceptResetsAt.getTime()).toBeGreaterThan(Date.now());
    // No INSERT/UPDATE may be attempted against the drifted relation.
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(captureWarning).toHaveBeenCalledTimes(1);
  });

  it('still throws non-drift DB errors (no broad swallow)', async () => {
    setupDbSelectError(new Error('connection terminated unexpectedly'));

    await expect(isWaitlistGateEnabled()).rejects.toThrow(
      'connection terminated unexpectedly'
    );
    expect(captureWarning).not.toHaveBeenCalled();
  });
});
