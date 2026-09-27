import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as leadFunnelEventsApi from '@/lib/leads/funnel-events';

const { mockCaptureError, mockDbInsert, mockDbSelect, mockCookies } =
  vi.hoisted(() => ({
    mockCaptureError: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbSelect: vi.fn(),
    mockCookies: vi.fn(),
  }));

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
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

function createSelectChain<T>(rows: T[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((_condition?: SQL) => chain),
    limit: vi.fn().mockResolvedValue(rows),
  };

  return chain;
}

describe('attributeLeadCheckoutAbandonment', () => {
  const insertValues = vi.fn();
  const onConflictDoNothing = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockResolvedValue(undefined);
    mockDbInsert.mockReturnValue({ values: insertValues });
  });

  it('skips sessions with no resolvable identity', async () => {
    const { attributeLeadCheckoutAbandonment } = leadFunnelEventsApi;
    const result = await attributeLeadCheckoutAbandonment({
      stripeSessionId: 'cs_test_anon',
    });

    expect(result).toEqual({
      recorded: false,
      reason: 'unidentified_checkout_session',
    });
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('skips when the identity does not resolve to an app user', async () => {
    mockDbSelect.mockImplementationOnce(() => createSelectChain([]));

    const { attributeLeadCheckoutAbandonment } = leadFunnelEventsApi;
    const result = await attributeLeadCheckoutAbandonment({
      userIdentity: 'user_missing',
      stripeCustomerId: 'cus_missing',
      stripeSessionId: 'cs_test_expired',
    });

    expect(result).toEqual({ recorded: false, reason: 'user_not_found' });
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('skips when the resolved user has no attributed lead', async () => {
    mockDbSelect
      .mockImplementationOnce(() => createSelectChain([{ id: 'app_user_123' }]))
      .mockImplementationOnce(() => createSelectChain([]));

    const { attributeLeadCheckoutAbandonment } = leadFunnelEventsApi;
    const result = await attributeLeadCheckoutAbandonment({
      stripeCustomerId: 'cus_123',
      stripeSessionId: 'cs_test_expired',
    });

    expect(result).toEqual({
      recorded: false,
      reason: 'no_attributed_lead',
    });
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('records an idempotent checkout_abandoned event on the attributed lead', async () => {
    mockDbSelect
      .mockImplementationOnce(() => createSelectChain([{ id: 'app_user_123' }]))
      .mockImplementationOnce(() => createSelectChain([{ id: 'lead_123' }]));

    const { attributeLeadCheckoutAbandonment } = leadFunnelEventsApi;
    const result = await attributeLeadCheckoutAbandonment({
      userIdentity: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      stripeCustomerId: 'cus_123',
      stripeSessionId: 'cs_test_expired',
      correlation: { runId: 'run_1', claimId: 'claim_1' },
    });

    expect(result).toEqual({ recorded: true });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead_123',
        eventType: 'checkout_abandoned',
        metadata: expect.objectContaining({
          signupUserId: 'app_user_123',
          stripeSessionId: 'cs_test_expired',
          runId: 'run_1',
          claimId: 'claim_1',
        }),
      })
    );
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it('propagates required funnel write failures for retry', async () => {
    mockDbSelect
      .mockImplementationOnce(() => createSelectChain([{ id: 'app_user_123' }]))
      .mockImplementationOnce(() => createSelectChain([{ id: 'lead_123' }]));
    onConflictDoNothing.mockRejectedValue(new Error('db down'));

    const { attributeLeadCheckoutAbandonment } = leadFunnelEventsApi;
    await expect(
      attributeLeadCheckoutAbandonment({
        userIdentity: 'user_123',
        stripeSessionId: 'cs_test_expired',
      })
    ).rejects.toThrow('db down');
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Failed to record lead funnel event',
      expect.any(Error),
      expect.objectContaining({
        contextData: expect.objectContaining({
          eventType: 'checkout_abandoned',
        }),
      })
    );
  });
});
