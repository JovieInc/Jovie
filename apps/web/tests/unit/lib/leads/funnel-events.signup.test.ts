import crypto from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as leadFunnelEventsApi from '@/lib/leads/funnel-events';

const {
  mockCaptureError,
  mockDbInsert,
  mockDbSelect,
  mockDbUpdate,
  mockCookies,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockCookies: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    LEAD_ATTRIBUTION_SECRET: 'lead-secret',
    URL_ENCRYPTION_KEY: 'url-secret',
  },
  isSecureEnv: vi.fn(() => true),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

function createCookieStore() {
  const values = new Map<string, string>();

  return {
    delete: vi.fn((name: string) => {
      values.delete(name);
    }),
    get: vi.fn((name: string) => {
      const value = values.get(name);
      return value ? { value } : undefined;
    }),
    set: vi.fn(
      (name: string, value: string, _options?: Record<string, unknown>) => {
        values.set(name, value);
      }
    ),
    values,
  };
}

function createSelectChain<T>(rows: T[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((_condition?: SQL) => chain),
    limit: vi.fn().mockResolvedValue(rows),
  };

  return chain;
}

function signLeadAttributionBody(body: string): string {
  const secret = crypto
    .createHmac('sha256', 'lead-secret')
    .update('lead-attribution-cookie')
    .digest('hex');

  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('attributeLeadSignupFromAppUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDbInsert.mockImplementation(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      })),
    }));
    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));
  });

  it('returns null attribution when no cookie is present', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromAppUserId } = leadFunnelEventsApi;
    const result = await attributeLeadSignupFromAppUserId('clerk_123');

    expect(result).toEqual({ leadId: null, userId: null });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('treats an invalid cookie as missing attribution', async () => {
    const cookieStore = createCookieStore();
    cookieStore.values.set('jovie_lead_attribution', 'not.valid');
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromAppUserId } = leadFunnelEventsApi;
    const result = await attributeLeadSignupFromAppUserId('clerk_123');

    expect(result).toEqual({ leadId: null, userId: null });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('captures malformed signed cookie payloads and treats them as missing attribution', async () => {
    const cookieStore = createCookieStore();
    const body = Buffer.from('{', 'utf8').toString('base64url');
    cookieStore.values.set(
      'jovie_lead_attribution',
      `${body}.${signLeadAttributionBody(body)}`
    );
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromAppUserId } = leadFunnelEventsApi;
    const result = await attributeLeadSignupFromAppUserId('clerk_123');

    expect(result).toEqual({ leadId: null, userId: null });
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Failed to parse lead attribution cookie',
      expect.any(SyntaxError),
      expect.objectContaining({
        route: 'lib/leads/funnel-events',
      })
    );
  });

  it('treats an expired cookie as missing attribution', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const dateNowSpy = vi.spyOn(Date, 'now');
    try {
      dateNowSpy.mockReturnValue(1_700_000_000_000);

      const { attributeLeadSignupFromAppUserId, setLeadAttributionCookie } =
        leadFunnelEventsApi;

      await setLeadAttributionCookie({
        leadId: 'lead_123',
        channel: 'email',
        provider: 'instantly',
        campaignKey: 'claim_invite',
        variantKey: null,
        contactAttemptId: 'attempt_123',
      });

      dateNowSpy.mockReturnValue(1_700_000_000_000 + 31 * 24 * 60 * 60 * 1000);

      const result = await attributeLeadSignupFromAppUserId('clerk_123');

      expect(result).toEqual({ leadId: null, userId: null });
      expect(mockDbSelect).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('retains attribution and rejects completion when the authenticated user is missing', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromAppUserId, setLeadAttributionCookie } =
      leadFunnelEventsApi;

    await setLeadAttributionCookie({
      leadId: 'lead_123',
      channel: 'email',
      provider: 'instantly',
      campaignKey: 'claim_invite',
      variantKey: null,
      contactAttemptId: 'attempt_123',
    });

    mockDbSelect.mockImplementationOnce(() => createSelectChain([]));

    await expect(attributeLeadSignupFromAppUserId('clerk_123')).rejects.toThrow(
      'Authenticated app user not found'
    );
    expect(cookieStore.values.has('jovie_lead_attribution')).toBe(true);
  });

  it('queries the real Better Auth app UUID rather than a legacy Clerk identifier', async () => {
    const appUserId = '7b4b948f-9720-4c5f-98da-8a7335015da9';
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);
    await leadFunnelEventsApi.setLeadAttributionCookie({
      leadId: 'lead_123',
      channel: 'email',
      provider: null,
      campaignKey: null,
      variantKey: null,
      contactAttemptId: null,
    });
    const select = createSelectChain([
      { id: appUserId, activeProfileId: null },
    ]);
    mockDbSelect
      .mockImplementationOnce(() => select)
      .mockImplementationOnce(() =>
        createSelectChain([
          { id: 'lead_123', signupUserId: null, signupAt: null, paidAt: null },
        ])
      );
    await leadFunnelEventsApi.attributeLeadSignupFromAppUserId(appUserId);
    const condition = select.where.mock.calls[0]?.[0] as unknown as SQL;
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"users"."id" =');
    expect(query.sql).not.toContain('"clerk_id"');
    expect(query.params).toEqual([appUserId]);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it('returns the user id without mutating when the lead record does not exist', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromAppUserId, setLeadAttributionCookie } =
      leadFunnelEventsApi;

    await setLeadAttributionCookie({
      leadId: 'lead_123',
      channel: 'email',
      provider: 'instantly',
      campaignKey: 'claim_invite',
      variantKey: null,
      contactAttemptId: 'attempt_123',
    });

    mockDbSelect
      .mockImplementationOnce(() => createSelectChain([{ id: 'user_123' }]))
      .mockImplementationOnce(() => createSelectChain([]));

    const result = await attributeLeadSignupFromAppUserId('clerk_123');

    expect(result).toEqual({ leadId: 'lead_123', userId: 'user_123' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('does not mutate a lead already attributed to another user', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromAppUserId, setLeadAttributionCookie } =
      leadFunnelEventsApi;

    await setLeadAttributionCookie({
      leadId: 'lead_123',
      channel: 'email',
      provider: 'instantly',
      campaignKey: 'claim_invite',
      variantKey: 'v1',
      contactAttemptId: 'attempt_123',
    });

    mockDbSelect
      .mockImplementationOnce(() => createSelectChain([{ id: 'user_123' }]))
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            id: 'lead_123',
            signupUserId: 'other_user',
            signupAt: null,
            paidAt: null,
          },
        ])
      );

    const result = await attributeLeadSignupFromAppUserId('clerk_123');

    expect(result).toEqual({ leadId: 'lead_123', userId: 'user_123' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('attributes signup, records idempotent funnel events, and clears the cookie', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromAppUserId, setLeadAttributionCookie } =
      leadFunnelEventsApi;

    await setLeadAttributionCookie({
      leadId: 'lead_123',
      channel: 'email',
      provider: 'instantly',
      campaignKey: 'claim_invite',
      variantKey: 'variant_a',
      contactAttemptId: 'attempt_123',
    });

    const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);
    const insertValuesMock = vi.fn(() => ({
      onConflictDoNothing: onConflictDoNothingMock,
    }));
    mockDbInsert.mockImplementation(() => ({
      values: insertValuesMock,
    }));

    mockDbSelect
      .mockImplementationOnce(() =>
        createSelectChain([{ id: 'user_123', activeProfileId: 'profile_123' }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            id: 'lead_123',
            signupUserId: null,
            signupAt: null,
            paidAt: null,
          },
        ])
      );

    mockDbSelect.mockImplementationOnce(() =>
      createSelectChain([
        { onboardingCompletedAt: new Date('2026-09-12T12:00:00Z') },
      ])
    );

    const result = await attributeLeadSignupFromAppUserId('clerk_123');

    expect(result).toEqual({ leadId: 'lead_123', userId: 'user_123' });
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledTimes(2);
    expect(onConflictDoNothingMock).toHaveBeenCalledTimes(2);
    expect(insertValuesMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        leadId: 'lead_123',
        eventType: 'signup_completed',
        channel: 'email',
        provider: 'instantly',
      })
    );
    expect(insertValuesMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        leadId: 'lead_123',
        eventType: 'onboarding_completed',
        channel: 'email',
        provider: 'instantly',
      })
    );
    expect(cookieStore.delete).toHaveBeenCalledWith('jovie_lead_attribution');
  });
});

describe('signup and activation receipt durability', () => {
  async function setupReceiptStore(
    options: {
      completedAt?: Date | null;
      activeProfileId?: string | null;
      missingProfile?: boolean;
      failEvent?: string;
    } = {}
  ) {
    vi.clearAllMocks();
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);
    const api = leadFunnelEventsApi;
    await api.setLeadAttributionCookie({
      leadId: 'lead_123',
      channel: 'email',
      provider: 'instantly',
      campaignKey: 'claim_invite',
      variantKey: 'v1',
      contactAttemptId: 'attempt_123',
    });
    const completedAt =
      options.completedAt === undefined
        ? new Date('2026-09-12T12:00:00Z')
        : options.completedAt;
    const lead = {
      id: 'lead_123',
      signupUserId: null as string | null,
      signupAt: null as Date | null,
      paidAt: null,
    };
    const events = new Map<string, { eventType: string; occurredAt: Date }>();
    let failed = false;
    mockDbSelect.mockImplementation((fields: Record<string, unknown>) => {
      if ('activeProfileId' in fields)
        return createSelectChain([
          {
            id: 'user_123',
            activeProfileId:
              options.activeProfileId === undefined
                ? 'profile_123'
                : options.activeProfileId,
          },
        ]);
      if ('signupUserId' in fields) return createSelectChain([{ ...lead }]);
      return createSelectChain(
        options.missingProfile ? [] : [{ onboardingCompletedAt: completedAt }]
      );
    });
    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          Object.assign(lead, values);
        }),
      })),
    }));
    mockDbInsert.mockImplementation(() => ({
      values: vi.fn((row: { eventType: string; occurredAt: Date }) => ({
        onConflictDoNothing: vi.fn(async () => {
          if (row.eventType === options.failEvent && !failed) {
            failed = true;
            throw new Error('receipt write failed');
          }
          if (!events.has(row.eventType)) events.set(row.eventType, row);
        }),
      })),
    }));
    return { api, cookieStore, lead, events, completedAt };
  }

  it.each(['signup_completed', 'onboarding_completed'])(
    'retains attribution when %s fails and reconciles exactly once on retry',
    async failEvent => {
      const { api, cookieStore, lead, events, completedAt } =
        await setupReceiptStore({ failEvent });
      await expect(
        api.attributeLeadSignupFromAppUserId('clerk_123')
      ).rejects.toThrow('receipt write failed');
      expect(cookieStore.values.has('jovie_lead_attribution')).toBe(true);
      expect(cookieStore.delete).not.toHaveBeenCalled();
      expect(events.has(failEvent)).toBe(false);
      const signupAt = lead.signupAt;
      await api.attributeLeadSignupFromAppUserId('clerk_123');
      await api.attributeLeadSignupFromAppUserId('clerk_123');
      expect([...events.keys()]).toEqual([
        'signup_completed',
        'onboarding_completed',
      ]);
      expect(events.get('signup_completed')?.occurredAt).toBe(signupAt);
      expect(events.get('onboarding_completed')?.occurredAt).toBe(completedAt);
      expect(cookieStore.values.has('jovie_lead_attribution')).toBe(false);
      expect(cookieStore.delete).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    { name: 'reserved profile', completedAt: null },
    { name: 'no active profile', activeProfileId: null },
    { name: 'no owned active profile', missingProfile: true },
  ])(
    'does not call $name activated or clear its attribution',
    async options => {
      const { api, cookieStore, events } = await setupReceiptStore(options);
      await api.attributeLeadSignupFromAppUserId('clerk_123');
      expect([...events.keys()]).toEqual(['signup_completed']);
      expect(cookieStore.values.has('jovie_lead_attribution')).toBe(true);
      expect(cookieStore.delete).not.toHaveBeenCalled();
    }
  );

  it('rejects unavailable persistence without losing attribution', async () => {
    const { api, cookieStore } = await setupReceiptStore();
    mockDbInsert.mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    await expect(
      api.attributeLeadSignupFromAppUserId('clerk_123')
    ).rejects.toThrow('storage unavailable');
    expect(cookieStore.values.has('jovie_lead_attribution')).toBe(true);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});

function createPaidConversionStore(options?: {
  failFirstEventWrite?: boolean;
  proofAttributed?: boolean;
}) {
  const leadState = {
    id: 'lead_123',
    paidAt: null as Date | null,
    paidSubscriptionId: null as string | null,
  };
  const recordedEvents: Array<{
    eventType: string;
    leadId: string;
    campaignKey?: string | null;
  }> = [];
  let eventWriteAttempts = 0;

  mockDbSelect.mockImplementation((fields: Record<string, unknown>) => {
    if ('paidAt' in fields || 'paidSubscriptionId' in fields) {
      return createSelectChain([
        {
          id: leadState.id,
          paidAt: leadState.paidAt,
          paidSubscriptionId: leadState.paidSubscriptionId,
        },
      ]);
    }

    return createSelectChain(
      options?.proofAttributed ? [{ id: 'evt_proof_to_claim' }] : []
    );
  });
  mockDbUpdate.mockImplementation(() => ({
    set: vi.fn((values: { paidAt?: Date; paidSubscriptionId?: string }) => ({
      where: vi.fn().mockImplementation(async () => {
        leadState.paidAt = values.paidAt ?? leadState.paidAt;
        leadState.paidSubscriptionId =
          values.paidSubscriptionId ?? leadState.paidSubscriptionId;
      }),
    })),
  }));
  mockDbInsert.mockImplementation(() => ({
    values: vi.fn(
      (row: {
        eventType: string;
        leadId: string;
        campaignKey?: string | null;
      }) => ({
        onConflictDoNothing: vi.fn().mockImplementation(async () => {
          eventWriteAttempts += 1;
          if (options?.failFirstEventWrite && eventWriteAttempts === 1) {
            throw new Error('injected event-write failure');
          }
          if (
            !recordedEvents.some(
              event =>
                event.leadId === row.leadId && event.eventType === row.eventType
            )
          ) {
            recordedEvents.push({
              leadId: row.leadId,
              eventType: row.eventType,
              campaignKey: row.campaignKey,
            });
          }
        }),
      })
    ),
  }));

  return { leadState, recordedEvents };
}

describe('attributeLeadPaidConversionByAppUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));
  });

  it('records exactly one paid_converted event on the happy path, including retry', async () => {
    const { leadState, recordedEvents } = createPaidConversionStore();
    const { attributeLeadPaidConversionByAppUserId } = leadFunnelEventsApi;

    await attributeLeadPaidConversionByAppUserId('user_123', 'sub_happy');
    await attributeLeadPaidConversionByAppUserId('user_123', 'sub_happy');

    expect(leadState.paidAt).toBeInstanceOf(Date);
    expect(leadState.paidSubscriptionId).toBe('sub_happy');
    expect(recordedEvents).toEqual([
      {
        leadId: 'lead_123',
        eventType: 'paid_converted',
        campaignKey: 'premade-artist-profile',
      },
    ]);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it('records proof-to-claim activation without rewriting paid_converted campaign', async () => {
    const { recordedEvents } = createPaidConversionStore({
      proofAttributed: true,
    });
    const { attributeLeadPaidConversionByAppUserId } = leadFunnelEventsApi;

    await attributeLeadPaidConversionByAppUserId('user_123', 'sub_proof');

    expect(recordedEvents).toEqual([
      {
        leadId: 'lead_123',
        eventType: 'paid_converted',
        campaignKey: 'premade-artist-profile',
      },
      {
        leadId: 'lead_123',
        eventType: 'activation',
        campaignKey: 'proof-to-claim',
      },
    ]);
  });

  it('reconciles a missing paid_converted event after an injected write failure', async () => {
    const { leadState, recordedEvents } = createPaidConversionStore({
      failFirstEventWrite: true,
    });
    const { attributeLeadPaidConversionByAppUserId } = leadFunnelEventsApi;

    await expect(
      attributeLeadPaidConversionByAppUserId('user_123', 'sub_retry')
    ).rejects.toThrow('injected event-write failure');
    expect(leadState.paidAt).toBeInstanceOf(Date);
    expect(recordedEvents).toEqual([]);
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Failed to record lead funnel event',
      expect.any(Error),
      expect.objectContaining({
        route: 'lib/leads/funnel-events',
        contextData: expect.objectContaining({
          leadId: 'lead_123',
          eventType: 'paid_converted',
        }),
      })
    );

    await attributeLeadPaidConversionByAppUserId('user_123', 'sub_retry');

    expect(leadState.paidAt).toBeInstanceOf(Date);
    expect(leadState.paidSubscriptionId).toBe('sub_retry');
    expect(recordedEvents).toEqual([
      {
        leadId: 'lead_123',
        eventType: 'paid_converted',
        campaignKey: 'premade-artist-profile',
      },
    ]);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it('attributes a Better Auth purchase by app UUID, not its ba: legacy sentinel', async () => {
    const betterAuthRow = {
      id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      clerkId: 'ba:better_auth_123',
    };
    mockDbSelect
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            id: 'lead_123',
            paidAt: null,
            paidSubscriptionId: null,
          },
        ])
      )
      .mockImplementationOnce(() => createSelectChain([]));
    const insertValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }));
    mockDbInsert.mockImplementation(() => ({ values: insertValues }));

    const { attributeLeadPaidConversionByAppUserId } = leadFunnelEventsApi;
    await attributeLeadPaidConversionByAppUserId(
      betterAuthRow.id,
      'sub_better_auth'
    );

    expect(mockDbSelect).toHaveBeenCalledTimes(2);
    expect(mockDbUpdate).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead_123',
        eventType: 'paid_converted',
        campaignKey: 'premade-artist-profile',
        variantKey: 'launch-acquisition:premade-artist-profile:v1',
        metadata: expect.objectContaining({
          signupUserId: betterAuthRow.id,
          stripeSubscriptionId: 'sub_better_auth',
          experimentId: 'premade-artist-profile',
        }),
      })
    );
    expect(insertValues).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          signupUserId: betterAuthRow.clerkId,
        }),
      })
    );
  });

  it('preserves the legacy Clerk entry point while attributing by resolved app UUID', async () => {
    mockDbSelect
      .mockImplementationOnce(() =>
        createSelectChain([{ id: 'legacy_app_user_123' }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            id: 'lead_legacy',
            paidAt: null,
            paidSubscriptionId: null,
          },
        ])
      )
      .mockImplementationOnce(() => createSelectChain([]));
    const insertValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }));
    mockDbInsert.mockImplementation(() => ({ values: insertValues }));

    const { attributeLeadPaidConversionByClerkUserId } = leadFunnelEventsApi;
    await attributeLeadPaidConversionByClerkUserId(
      'user_legacy_123',
      'sub_legacy'
    );

    expect(mockDbSelect).toHaveBeenCalledTimes(3);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead_legacy',
        metadata: expect.objectContaining({
          signupUserId: 'legacy_app_user_123',
          stripeSubscriptionId: 'sub_legacy',
        }),
      })
    );
  });
});
