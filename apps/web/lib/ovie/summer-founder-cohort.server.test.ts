import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { read, activation } = vi.hoisted(() => ({
  read: vi.fn(),
  activation: vi.fn(),
}));
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelStageRows: read,
}));
vi.mock('@/lib/db/queries/account-activation', () => ({
  readAccountActivation: activation,
}));
const { getSummerFounderAccounts } = await import(
  './summer-founder-cohort.server'
);

describe('Summer founder account diagnosis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activation.mockResolvedValue([]);
  });

  it('exposes stored activation evidence without inferring token eligibility or a claim attempt', async () => {
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 1,
      errors: [],
      rows: [{ id: 'u1', displayName: null, enteredAt: null }],
    });
    activation.mockResolvedValue([
      {
        id: 'u1',
        accountStatus: 'waitlist_pending',
        waitlistLinked: true,
        waitlistStatus: 'new',
        attachedOnboardingConversation: false,
        ownedProfileCount: 0,
        claimedProfileCount: 0,
        roleClaimCount: 0,
      },
    ]);
    const result = await getSummerFounderAccounts(50);
    expect(activation).toHaveBeenCalledExactlyOnceWith(['u1']);
    expect(result).toMatchObject({
      rows: [
        {
          activation: {
            status: 'observed',
            accountStatus: 'waitlist_pending',
            waitlistLinked: true,
            waitlistStatus: 'new',
            attachedOnboardingConversation: false,
            ownedProfileCount: 0,
            claimedProfileCount: 0,
            roleClaimCount: 0,
            claimTokenState: 'unknown',
            claimAttemptState: 'unknown',
          },
        },
      ],
    });
  });

  it('uses the canonical 30d population and exposes bounded diagnosis without contact data', async () => {
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 4,
      errors: [],
      rows: [
        {
          id: 'u1',
          displayName: 'Ada',
          email: 'private@example.com',
          enteredAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    });
    const result = await getSummerFounderAccounts(1);
    expect(read).toHaveBeenCalledExactlyOnceWith('accounts_created', '30d', 1);
    expect(result).toEqual({
      metricScope: 'customer_only',
      total: 4,
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      purpose: 'activation_diagnosis',
      hasMore: true,
      rows: [
        {
          id: 'u1',
          displayName: 'Ada',
          enteredAt: '2026-10-01T00:00:00.000Z',
          activation: {
            status: 'unknown',
            reason: 'account_state_unavailable',
          },
        },
      ],
    });
  });

  it('preserves an observed empty cohort and missing identity fields', async () => {
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 0,
      errors: [],
      rows: [],
    });
    expect(await getSummerFounderAccounts(50)).toMatchObject({
      total: 0,
      rows: [],
      hasMore: false,
    });
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 1,
      errors: [],
      rows: [{ id: 'u2', displayName: null, enteredAt: null }],
    });
    expect(await getSummerFounderAccounts(50)).toMatchObject({
      rows: [{ id: 'u2', displayName: 'Account' }],
      hasMore: false,
    });
  });

  it('reports unavailable when the canonical reader returns its error sentinel', async () => {
    read.mockResolvedValue({
      total: 0,
      rows: [],
      errors: ['database private details'],
    });
    expect(await getSummerFounderAccounts(50)).toEqual({
      status: 'unavailable',
      reason: 'founder_cohort_read_failed',
    });
  });

  it('propagates unexpected failures for the authenticated route to return 503', async () => {
    read.mockRejectedValue(new Error('database unavailable'));
    await expect(getSummerFounderAccounts(50)).rejects.toThrow(
      'database unavailable'
    );
  });

  it('keeps vanished account state unknown and does not add other accounts to the cohort', async () => {
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 4,
      errors: [],
      rows: [{ id: 'u1', displayName: null, enteredAt: null }],
    });
    activation.mockResolvedValue([
      { id: 'not-in-cohort', accountStatus: 'active' },
    ]);
    expect(await getSummerFounderAccounts(1)).toMatchObject({
      total: 4,
      hasMore: true,
      rows: [
        {
          id: 'u1',
          activation: {
            status: 'unknown',
            reason: 'account_state_unavailable',
          },
        },
      ],
    });
  });

  it('propagates a failed activation read instead of reporting zero claims', async () => {
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 1,
      errors: [],
      rows: [{ id: 'u1' }],
    });
    activation.mockRejectedValue(new Error('activation unavailable'));
    await expect(getSummerFounderAccounts(1)).rejects.toThrow(
      'activation unavailable'
    );
  });

  it('does not leak unrelated database fields through the diagnostic projection', async () => {
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 1,
      errors: [],
      rows: [{ id: 'u1' }],
    });
    activation.mockResolvedValue([
      {
        id: 'u1',
        accountStatus: 'active',
        waitlistLinked: false,
        waitlistStatus: null,
        attachedOnboardingConversation: true,
        ownedProfileCount: 1,
        claimedProfileCount: 1,
        roleClaimCount: 1,
        email: 'private@example.com',
        claimToken: 'secret-token',
        sessionId: 'private-session',
        transcript: 'private-content',
      },
    ]);
    const result = await getSummerFounderAccounts(1);
    expect(result).toMatchObject({
      rows: [
        {
          activation: {
            status: 'observed',
            claimedProfileCount: 1,
            claimTokenState: 'unknown',
          },
        },
      ],
    });
    for (const secret of [
      'private@example.com',
      'secret-token',
      'private-session',
      'private-content',
    ])
      expect(JSON.stringify(result)).not.toContain(secret);
  });
});
