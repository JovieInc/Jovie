import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockOnConflictDoUpdate = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

import { recipientPreferences as barrelRecipientPreferences } from '@/lib/db/schema';
import {
  MARKETING_CONSENT_VERSION,
  RECIPIENT_PREFERENCES_VERSION,
  recipientPreferences,
} from '@/lib/db/schema/recipient-preferences';
import {
  defaultRecipientPreferences,
  fromStoredRecipientPreferences,
  type RecipientPreferences,
  RecipientPreferencesError,
  type RecipientPreferencesStore,
  readRecipientPreferences,
  type StoredRecipientPreferences,
  toStoredRecipientPreferences,
  writeRecipientPreferences,
} from './recipient-preferences';
import {
  readStoredRecipientPreferences,
  writeStoredRecipientPreferences,
} from './recipient-preferences-store';

const TIM_USER_ID = 'ba_user_tim';
const CUSTOMER_USER_ID = 'ba_user_customer';
const CONSENT_AT = '2026-09-25T15:00:00.000Z';

function memoryStore(
  seed: StoredRecipientPreferences[] = []
): RecipientPreferencesStore & {
  rows: Map<string, StoredRecipientPreferences>;
  saves: number;
} {
  const rows = new Map(seed.map(row => [row.betterAuthUserId, row]));
  let saves = 0;
  return {
    rows,
    get saves() {
      return saves;
    },
    async find(betterAuthUserId) {
      return rows.get(betterAuthUserId) ?? null;
    },
    async save(row) {
      saves += 1;
      rows.set(row.betterAuthUserId, row);
    },
  };
}

function customerWrite(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    betterAuthUserId: CUSTOMER_USER_ID,
    recipientKind: 'customer',
    timezone: 'America/Chicago',
    quietHours: { start: '21:00', end: '08:00' },
    weekendBehavior: 'observe_quiet_hours',
    briefingBehavior: 'off',
    channels: { email: false, sms: false, push: false, in_app: false },
    marketingOptIn: false,
    marketingConsent: null,
    ...overrides,
  };
}

describe('recipient preference persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockValues.mockReturnValue({
      onConflictDoUpdate: mockOnConflictDoUpdate,
    });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('uses the schema barrel export of the Better Auth preference table', () => {
    expect(barrelRecipientPreferences).toBe(recipientPreferences);
  });

  it('keeps the generated migration on the current versions', () => {
    const sql = readFileSync(
      join(process.cwd(), 'drizzle/migrations/0107_recipient_preferences.sql'),
      'utf8'
    );
    expect(sql).toContain(
      `"preference_version" = ${RECIPIENT_PREFERENCES_VERSION}`
    );
    expect(sql).toContain(`'${MARKETING_CONSENT_VERSION}'`);
    expect(sql).toContain('REFERENCES "public"."ba_users"("id")');
    expect(sql).not.toContain('clerk');
  });

  it('reads a stored consent timestamp through the drizzle accessor', async () => {
    mockLimit.mockResolvedValue([
      {
        betterAuthUserId: CUSTOMER_USER_ID,
        preferenceVersion: 1,
        recipientKind: 'customer',
        timezone: 'America/Chicago',
        quietHoursStart: '21:00',
        quietHoursEnd: '08:00',
        weekendBehavior: 'observe_quiet_hours',
        briefingBehavior: 'off',
        channelEmail: true,
        channelSms: false,
        channelPush: false,
        channelInApp: false,
        marketingOptIn: true,
        marketingConsentVersion: MARKETING_CONSENT_VERSION,
        marketingConsentRecordedAt: new Date(CONSENT_AT),
      },
    ]);

    const read = await readStoredRecipientPreferences({
      betterAuthUserId: CUSTOMER_USER_ID,
      recipientKind: 'tim',
      localTimezone: 'America/Los_Angeles',
    });

    expect(read.marketingOptIn).toBe(true);
    expect(read.marketingConsent?.recordedAt).toBe(
      new Date(CONSENT_AT).toISOString()
    );
    expect(read.recipientKind).toBe('customer');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns customer defaults when the drizzle row is missing', async () => {
    mockLimit.mockResolvedValue([]);

    const read = await readStoredRecipientPreferences({
      betterAuthUserId: CUSTOMER_USER_ID,
      recipientKind: 'customer',
      localTimezone: 'America/Chicago',
    });

    expect(read.marketingOptIn).toBe(false);
    expect(read.timezone).toBe('America/Chicago');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('writes an explicit opt-in through the drizzle accessor', async () => {
    mockLimit.mockResolvedValue([]);

    const written = await writeStoredRecipientPreferences(
      customerWrite({
        marketingOptIn: true,
        marketingConsent: {
          version: MARKETING_CONSENT_VERSION,
          recordedAt: CONSENT_AT,
        },
      })
    );

    expect(written.version).toBe(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        betterAuthUserId: CUSTOMER_USER_ID,
        marketingOptIn: true,
        marketingConsentVersion: MARKETING_CONSENT_VERSION,
        marketingConsentRecordedAt: new Date(CONSENT_AT),
      })
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: recipientPreferences.betterAuthUserId,
      })
    );
  });
});

describe('recipient preference defaults', () => {
  it('gives Tim America/Los_Angeles and weekend Summer briefing eligibility', () => {
    const preferences = defaultRecipientPreferences({
      betterAuthUserId: TIM_USER_ID,
      recipientKind: 'tim',
      localTimezone: 'America/New_York',
    });

    expect(preferences).toMatchObject({
      version: 1,
      timezone: 'America/Los_Angeles',
      weekendBehavior: 'weekend_briefing_eligible',
      briefingBehavior: 'weekend_summer',
      marketingOptIn: false,
      marketingConsent: null,
      channels: { email: false, sms: false, push: false, in_app: false },
    });
  });

  it('gives customers their local timezone and no marketing opt-in', () => {
    const preferences = defaultRecipientPreferences({
      betterAuthUserId: CUSTOMER_USER_ID,
      recipientKind: 'customer',
      localTimezone: 'America/Chicago',
    });

    expect(preferences).toMatchObject({
      version: 1,
      timezone: 'America/Chicago',
      weekendBehavior: 'observe_quiet_hours',
      briefingBehavior: 'off',
      marketingOptIn: false,
      marketingConsent: null,
    });
  });

  it('does not persist defaults when no row exists', async () => {
    const store = memoryStore();
    const preferences = await readRecipientPreferences(
      {
        betterAuthUserId: CUSTOMER_USER_ID,
        recipientKind: 'customer',
        localTimezone: 'Europe/London',
      },
      store
    );

    expect(preferences.timezone).toBe('Europe/London');
    expect(preferences.marketingOptIn).toBe(false);
    expect(store.saves).toBe(0);
    expect(store.rows.size).toBe(0);
  });

  it('rejects customer defaults without a local timezone', () => {
    expect(() =>
      defaultRecipientPreferences({
        betterAuthUserId: CUSTOMER_USER_ID,
        recipientKind: 'customer',
      })
    ).toThrow(RecipientPreferencesError);
  });
});

describe('recipient preference versioning', () => {
  it('stamps the current version on write', async () => {
    const store = memoryStore();
    const written = await writeRecipientPreferences(customerWrite(), store);

    expect(written.version).toBe(1);
    expect(store.rows.get(CUSTOMER_USER_ID)?.preferenceVersion).toBe(1);
  });

  it('rejects a stored future version instead of interpreting it', () => {
    const stored = toStoredRecipientPreferences(
      defaultRecipientPreferences({
        betterAuthUserId: TIM_USER_ID,
        recipientKind: 'tim',
      })
    );

    expect(() =>
      fromStoredRecipientPreferences({ ...stored, preferenceVersion: 2 })
    ).toThrow(expect.objectContaining({ code: 'version' }));
  });

  it('refuses to overwrite an unsupported stored version', async () => {
    const stored = toStoredRecipientPreferences(
      defaultRecipientPreferences({
        betterAuthUserId: TIM_USER_ID,
        recipientKind: 'tim',
      })
    );
    const store = memoryStore([{ ...stored, preferenceVersion: 0 }]);

    await expect(
      writeRecipientPreferences(
        customerWrite({
          betterAuthUserId: TIM_USER_ID,
          recipientKind: 'tim',
          timezone: 'America/Los_Angeles',
        }),
        store
      )
    ).rejects.toMatchObject({ code: 'version' });
    expect(store.saves).toBe(0);
    expect(store.rows.get(TIM_USER_ID)?.preferenceVersion).toBe(0);
  });
});

describe('recipient preference consent', () => {
  it('does not infer marketing opt-in from legacy flags or enabled channels', async () => {
    const store = memoryStore();
    const input = customerWrite({
      channels: { email: true, sms: true, push: true, in_app: true },
      marketingEmails: true,
      marketingOptOut: false,
      clerkUserId: 'clerk_user_1',
    });

    await expect(writeRecipientPreferences(input, store)).rejects.toMatchObject(
      { code: 'consent' }
    );
    expect(store.saves).toBe(0);
  });

  it('rejects marketing opt-in without an explicit consent record', async () => {
    const store = memoryStore();

    await expect(
      writeRecipientPreferences(customerWrite({ marketingOptIn: true }), store)
    ).rejects.toMatchObject({ code: 'consent' });
    expect(store.saves).toBe(0);
  });

  it('persists marketing opt-in only with the current consent version', async () => {
    const store = memoryStore();
    const written = await writeRecipientPreferences(
      customerWrite({
        marketingOptIn: true,
        marketingConsent: {
          version: MARKETING_CONSENT_VERSION,
          recordedAt: CONSENT_AT,
        },
      }),
      store
    );

    expect(written.marketingOptIn).toBe(true);
    expect(written.marketingConsent).toEqual({
      version: MARKETING_CONSENT_VERSION,
      recordedAt: CONSENT_AT,
    });
  });

  it('rejects an unknown marketing consent version', async () => {
    const store = memoryStore();

    await expect(
      writeRecipientPreferences(
        customerWrite({
          marketingOptIn: true,
          marketingConsent: {
            version: 'recipient-marketing-v2',
            recordedAt: CONSENT_AT,
          },
        }),
        store
      )
    ).rejects.toBeInstanceOf(RecipientPreferencesError);
    expect(store.saves).toBe(0);
  });

  it('rejects a stored opt-in that has no consent provenance', () => {
    const stored = toStoredRecipientPreferences(
      defaultRecipientPreferences({
        betterAuthUserId: CUSTOMER_USER_ID,
        recipientKind: 'customer',
        localTimezone: 'America/Chicago',
      })
    );

    expect(() =>
      fromStoredRecipientPreferences({ ...stored, marketingOptIn: true })
    ).toThrow(expect.objectContaining({ code: 'consent' }));
  });
});

describe('recipient preference invalid values', () => {
  it('rejects an unknown timezone, quiet-hour, channel, and behavior', async () => {
    const store = memoryStore();
    const cases: Record<string, unknown>[] = [
      customerWrite({ timezone: 'PST' }),
      customerWrite({ timezone: 'US/Pacific' }),
      customerWrite({ timezone: 'local' }),
      customerWrite({ quietHours: { start: '24:00', end: '08:00' } }),
      customerWrite({ quietHours: { start: '21:00', end: '21:00' } }),
      customerWrite({ weekendBehavior: 'always' }),
      customerWrite({ briefingBehavior: 'hourly' }),
      customerWrite({
        channels: { email: true, sms: false, push: false, fax: true },
      }),
      customerWrite({ betterAuthUserId: '   ' }),
    ];

    for (const input of cases) {
      await expect(
        writeRecipientPreferences(input, store)
      ).rejects.toBeInstanceOf(RecipientPreferencesError);
    }
    expect(store.saves).toBe(0);
  });

  it('round-trips a valid explicit write', async () => {
    const store = memoryStore();
    const written = await writeRecipientPreferences(
      customerWrite({
        channels: { email: true, sms: false, push: false, in_app: true },
      }),
      store
    );
    const read = await readRecipientPreferences(
      {
        betterAuthUserId: CUSTOMER_USER_ID,
        recipientKind: 'tim',
        localTimezone: 'America/Los_Angeles',
      },
      store
    );

    expect(read).toEqual(written satisfies RecipientPreferences);
    expect(read.recipientKind).toBe('customer');
    expect(read.timezone).toBe('America/Chicago');
    expect(read.briefingBehavior).toBe('off');
    expect(read.marketingOptIn).toBe(false);
  });
});
