import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    where: vi.fn(() => chain),
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

describe('attributeLeadSignupFromClerkUserId', () => {
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

    const { attributeLeadSignupFromClerkUserId } = await import(
      '@/lib/leads/funnel-events'
    );
    const result = await attributeLeadSignupFromClerkUserId('clerk_123');

    expect(result).toEqual({ leadId: null, userId: null });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('treats an invalid cookie as missing attribution', async () => {
    const cookieStore = createCookieStore();
    cookieStore.values.set('jovie_lead_attribution', 'not.valid');
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromClerkUserId } = await import(
      '@/lib/leads/funnel-events'
    );
    const result = await attributeLeadSignupFromClerkUserId('clerk_123');

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

    const { attributeLeadSignupFromClerkUserId } = await import(
      '@/lib/leads/funnel-events'
    );
    const result = await attributeLeadSignupFromClerkUserId('clerk_123');

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

      const { attributeLeadSignupFromClerkUserId, setLeadAttributionCookie } =
        await import('@/lib/leads/funnel-events');

      await setLeadAttributionCookie({
        leadId: 'lead_123',
        channel: 'email',
        provider: 'instantly',
        campaignKey: 'claim_invite',
        variantKey: null,
        contactAttemptId: 'attempt_123',
      });

      dateNowSpy.mockReturnValue(1_700_000_000_000 + 31 * 24 * 60 * 60 * 1000);

      const result = await attributeLeadSignupFromClerkUserId('clerk_123');

      expect(result).toEqual({ leadId: null, userId: null });
      expect(mockDbSelect).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('returns the lead id when the user has not been persisted yet', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromClerkUserId, setLeadAttributionCookie } =
      await import('@/lib/leads/funnel-events');

    await setLeadAttributionCookie({
      leadId: 'lead_123',
      channel: 'email',
      provider: 'instantly',
      campaignKey: 'claim_invite',
      variantKey: null,
      contactAttemptId: 'attempt_123',
    });

    mockDbSelect.mockImplementationOnce(() => createSelectChain([]));

    const result = await attributeLeadSignupFromClerkUserId('clerk_123');

    expect(result).toEqual({ leadId: 'lead_123', userId: null });
  });

  it('returns the user id without mutating when the lead record does not exist', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromClerkUserId, setLeadAttributionCookie } =
      await import('@/lib/leads/funnel-events');

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

    const result = await attributeLeadSignupFromClerkUserId('clerk_123');

    expect(result).toEqual({ leadId: 'lead_123', userId: 'user_123' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('does not mutate a lead already attributed to another user', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromClerkUserId, setLeadAttributionCookie } =
      await import('@/lib/leads/funnel-events');

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

    const result = await attributeLeadSignupFromClerkUserId('clerk_123');

    expect(result).toEqual({ leadId: 'lead_123', userId: 'user_123' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('attributes signup, records idempotent funnel events, and clears the cookie', async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { attributeLeadSignupFromClerkUserId, setLeadAttributionCookie } =
      await import('@/lib/leads/funnel-events');

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
      .mockImplementationOnce(() => createSelectChain([{ id: 'user_123' }]))
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

    const result = await attributeLeadSignupFromClerkUserId('clerk_123');

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

function createPaidConversionStore(options?: {
  failFirstEventWrite?: boolean;
}) {
  const leadState = {
    id: 'lead_123',
    paidAt: null as Date | null,
    paidSubscriptionId: null as string | null,
  };
  const recordedEvents: Array<{ eventType: string; leadId: string }> = [];
  let eventWriteAttempts = 0;

  mockDbSelect.mockImplementation(() =>
    createSelectChain([
      {
        id: leadState.id,
        paidAt: leadState.paidAt,
        paidSubscriptionId: leadState.paidSubscriptionId,
      },
    ])
  );
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
    values: vi.fn((row: { eventType: string; leadId: string }) => ({
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
          });
        }
      }),
    })),
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
    const { attributeLeadPaidConversionByAppUserId } = await import(
      '@/lib/leads/funnel-events'
    );

    await attributeLeadPaidConversionByAppUserId('user_123', 'sub_happy');
    await attributeLeadPaidConversionByAppUserId('user_123', 'sub_happy');

    expect(leadState.paidAt).toBeInstanceOf(Date);
    expect(leadState.paidSubscriptionId).toBe('sub_happy');
    expect(recordedEvents).toEqual([
      { leadId: 'lead_123', eventType: 'paid_converted' },
    ]);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it('reconciles a missing paid_converted event after an injected write failure', async () => {
    const { leadState, recordedEvents } = createPaidConversionStore({
      failFirstEventWrite: true,
    });
    const { attributeLeadPaidConversionByAppUserId } = await import(
      '@/lib/leads/funnel-events'
    );

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
      { leadId: 'lead_123', eventType: 'paid_converted' },
    ]);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it('attributes a Better Auth purchase by app UUID, not its ba: legacy sentinel', async () => {
    const betterAuthRow = {
      id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      clerkId: 'ba:better_auth_123',
    };
    mockDbSelect.mockImplementationOnce(() =>
      createSelectChain([
        {
          id: 'lead_123',
          paidAt: null,
          paidSubscriptionId: null,
        },
      ])
    );
    const insertValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }));
    mockDbInsert.mockImplementation(() => ({ values: insertValues }));

    const { attributeLeadPaidConversionByAppUserId } = await import(
      '@/lib/leads/funnel-events'
    );
    await attributeLeadPaidConversionByAppUserId(
      betterAuthRow.id,
      'sub_better_auth'
    );

    expect(mockDbSelect).toHaveBeenCalledOnce();
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
      );
    const insertValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }));
    mockDbInsert.mockImplementation(() => ({ values: insertValues }));

    const { attributeLeadPaidConversionByClerkUserId } = await import(
      '@/lib/leads/funnel-events'
    );
    await attributeLeadPaidConversionByClerkUserId(
      'user_legacy_123',
      'sub_legacy'
    );

    expect(mockDbSelect).toHaveBeenCalledTimes(2);
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
