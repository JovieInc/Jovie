import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------
const {
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockLoggerInfo,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerkId',
    referredByCode: 'users.referredByCode',
  },
}));

vi.mock('@/lib/db/schema/referrals', () => ({
  referralCodes: {
    id: 'referralCodes.id',
    userId: 'referralCodes.userId',
    code: 'referralCodes.code',
    isActive: 'referralCodes.isActive',
  },
  referrals: {
    id: 'referrals.id',
    referrerUserId: 'referrals.referrerUserId',
    referredUserId: 'referrals.referredUserId',
    referralCodeId: 'referrals.referralCodeId',
    status: 'referrals.status',
    commissionRateBps: 'referrals.commissionRateBps',
    commissionDurationMonths: 'referrals.commissionDurationMonths',
    subscribedAt: 'referrals.subscribedAt',
    expiresAt: 'referrals.expiresAt',
    churnedAt: 'referrals.churnedAt',
  },
  referralCommissions: {
    id: 'referralCommissions.id',
    referralId: 'referralCommissions.referralId',
    referrerUserId: 'referralCommissions.referrerUserId',
    stripeInvoiceId: 'referralCommissions.stripeInvoiceId',
    amountCents: 'referralCommissions.amountCents',
    currency: 'referralCommissions.currency',
    status: 'referralCommissions.status',
    periodStart: 'referralCommissions.periodStart',
    periodEnd: 'referralCommissions.periodEnd',
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ _type: 'eq', a, b })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    _type: 'sql',
    strings,
    values,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers — create Drizzle-style chainable mocks
// ---------------------------------------------------------------------------

/** Build a select chain: db.select(cols).from(table).where(cond).limit(n).groupBy(col)
 *  The .where() result is a thenable that also exposes .limit() and .groupBy()
 *  so queries ending at .where() (no .limit()) still resolve properly. */
function selectChain(resolvedValue: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(resolvedValue);
  const mockGroupBy = vi.fn().mockResolvedValue(resolvedValue);

  // Make the where-result both a plain object with chaining AND a thenable
  const whereResult = {
    limit: mockLimit,
    groupBy: mockGroupBy,
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(resolvedValue).then(resolve, reject),
  };

  const mockWhere = vi.fn().mockReturnValue(whereResult);
  const mockFrom = vi.fn().mockReturnValue({
    where: mockWhere,
    limit: mockLimit,
    groupBy: mockGroupBy,
  });
  return {
    from: mockFrom,
    where: mockWhere,
    limit: mockLimit,
    groupBy: mockGroupBy,
  };
}

/** Build an insert chain: db.insert(table).values(data).onConflictDoNothing().returning() */
function insertChain(opts?: {
  onConflictResult?: unknown[];
  shouldThrow?: Error;
}) {
  const mockReturning = vi.fn().mockResolvedValue(opts?.onConflictResult ?? []);
  const mockOnConflictDoNothing = vi.fn().mockReturnValue({
    returning: mockReturning,
  });
  const mockValues = vi.fn().mockImplementation(() => {
    if (opts?.shouldThrow) throw opts.shouldThrow;
    return {
      onConflictDoNothing: mockOnConflictDoNothing,
      returning: mockReturning,
    };
  });
  return {
    values: mockValues,
    onConflictDoNothing: mockOnConflictDoNothing,
    returning: mockReturning,
  };
}

/** Build an update chain: db.update(table).set(data).where(cond).returning() */
function updateChain(opts?: { returningValue?: unknown[] }) {
  const mockReturning = vi.fn().mockResolvedValue(opts?.returningValue ?? []);
  const mockWhere = vi.fn().mockReturnValue({
    returning: mockReturning,
  });
  // Also allow .where() to resolve directly (when no .returning() is chained)
  mockWhere.mockReturnValue({
    returning: mockReturning,
  });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  return { set: mockSet, where: mockWhere, returning: mockReturning };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('@critical referrals/service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // getOrCreateReferralCode
  // =========================================================================
  describe('getOrCreateReferralCode', () => {
    it('returns existing code when user already has one', async () => {
      const chain = selectChain([{ code: 'existing-code' }]);
      mockDbSelect.mockReturnValue(chain);

      const { getOrCreateReferralCode } = await import(
        '@/lib/referrals/service'
      );
      const result = await getOrCreateReferralCode('user-1');

      expect(result).toEqual({ code: 'existing-code', isNew: false });
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it('creates a new random code when user has none', async () => {
      // First select: no existing code
      const emptySelect = selectChain([]);
      mockDbSelect.mockReturnValue(emptySelect);

      // Insert succeeds
      const ins = insertChain();
      mockDbInsert.mockReturnValue(ins);

      const { getOrCreateReferralCode } = await import(
        '@/lib/referrals/service'
      );
      const result = await getOrCreateReferralCode('user-1');

      expect(result.isNew).toBe(true);
      expect(result.code).toBeTruthy();
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('creates a code with a valid custom code', async () => {
      // First select: no existing code
      const emptySelect = selectChain([]);
      mockDbSelect.mockReturnValue(emptySelect);

      // Insert succeeds (no throw)
      const ins = insertChain();
      mockDbInsert.mockReturnValue(ins);

      const { getOrCreateReferralCode } = await import(
        '@/lib/referrals/service'
      );
      const result = await getOrCreateReferralCode('user-1', 'MyCode');

      expect(result).toEqual({ code: 'mycode', isNew: true });
    });

    it('throws on collision with custom code after unique violation', async () => {
      // First select: no existing code
      const emptySelect = selectChain([]);
      mockDbSelect.mockReturnValue(emptySelect);

      // Insert throws unique constraint violation
      const uniqueError = new Error('duplicate key') as Error & {
        code: string;
      };
      uniqueError.code = '23505';

      const ins = insertChain({ shouldThrow: uniqueError });
      mockDbInsert.mockReturnValue(ins);

      const { getOrCreateReferralCode } = await import(
        '@/lib/referrals/service'
      );

      // After collision, re-check for the user's own code (none found, since
      // the collision was on a different user's code). Custom codes can't retry.
      await expect(
        getOrCreateReferralCode('user-1', 'TakenCode')
      ).rejects.toThrow('already taken');
    });

    it('retries on random code collision then succeeds', async () => {
      // Sequence of calls:
      // 1. select existing -> empty (no existing code)
      // 2. insert -> unique violation (random collision)
      // 3. select race winner -> empty (different user had same code)
      // 4. insert retry -> succeeds

      mockDbSelect.mockImplementation(() => {
        // All selects return empty
        return selectChain([]);
      });

      let insertCallCount = 0;
      mockDbInsert.mockImplementation(() => {
        insertCallCount++;
        if (insertCallCount === 1) {
          // First insert: collision
          const uniqueError = new Error('duplicate key') as Error & {
            code: string;
          };
          uniqueError.code = '23505';
          return insertChain({ shouldThrow: uniqueError });
        }
        // Second insert: success
        return insertChain();
      });

      const { getOrCreateReferralCode } = await import(
        '@/lib/referrals/service'
      );
      const result = await getOrCreateReferralCode('user-1');

      expect(result.isNew).toBe(true);
      expect(insertCallCount).toBe(2);
    });

    it('throws after MAX_UNIQUE_RETRIES exhausted', async () => {
      // All selects return empty, all inserts collide
      mockDbSelect.mockImplementation(() => selectChain([]));

      const uniqueError = new Error('duplicate key') as Error & {
        code: string;
      };
      uniqueError.code = '23505';
      mockDbInsert.mockImplementation(() =>
        insertChain({ shouldThrow: uniqueError })
      );

      const { getOrCreateReferralCode } = await import(
        '@/lib/referrals/service'
      );

      await expect(getOrCreateReferralCode('user-1')).rejects.toThrow(
        'Failed to create referral code after multiple attempts'
      );
    });
  });

  // =========================================================================
  // lookupReferralCode
  // =========================================================================
  describe('lookupReferralCode', () => {
    it('returns referrer info for a valid active code', async () => {
      const chain = selectChain([{ userId: 'referrer-1', id: 'code-id-1' }]);
      mockDbSelect.mockReturnValue(chain);

      const { lookupReferralCode } = await import('@/lib/referrals/service');
      const result = await lookupReferralCode('VALID-CODE');

      expect(result).toEqual({
        referrerUserId: 'referrer-1',
        referralCodeId: 'code-id-1',
      });
    });

    it('returns null for an invalid or inactive code', async () => {
      const chain = selectChain([]);
      mockDbSelect.mockReturnValue(chain);

      const { lookupReferralCode } = await import('@/lib/referrals/service');
      const result = await lookupReferralCode('invalid');

      expect(result).toBeNull();
    });

    it('normalizes code to lowercase and trims whitespace', async () => {
      const chain = selectChain([{ userId: 'referrer-1', id: 'code-id-1' }]);
      mockDbSelect.mockReturnValue(chain);

      const { lookupReferralCode } = await import('@/lib/referrals/service');
      await lookupReferralCode('  MY-CODE  ');

      // Verify the mock chain was called (from -> where -> limit)
      expect(mockDbSelect).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // createReferral
  // =========================================================================
  describe('createReferral', () => {
    it('creates a pending referral for a valid code', async () => {
      // 1. lookupReferralCode: select referralCodes -> found
      // 2. select existing referrals -> none
      // 3. insert referral -> success
      // 4. update user referredByCode

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // lookupReferralCode
          return selectChain([{ userId: 'referrer-1', id: 'code-id-1' }]);
        }
        // existing referrals check
        return selectChain([]);
      });

      const ins = insertChain();
      mockDbInsert.mockReturnValue(ins);

      const upd = updateChain();
      mockDbUpdate.mockReturnValue(upd);

      const { createReferral } = await import('@/lib/referrals/service');
      const result = await createReferral('referred-1', 'valid-code');

      expect(result).toEqual({ success: true });
      expect(mockDbInsert).toHaveBeenCalled();
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('blocks self-referrals', async () => {
      mockDbSelect.mockImplementation(() =>
        selectChain([{ userId: 'user-1', id: 'code-id-1' }])
      );

      const { createReferral } = await import('@/lib/referrals/service');
      const result = await createReferral('user-1', 'my-own-code');

      expect(result).toEqual({
        success: false,
        error: 'Cannot use your own referral code',
      });
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it('rejects when user already has an active referral', async () => {
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return selectChain([{ userId: 'referrer-1', id: 'code-id-1' }]);
        }
        // existing referrals: has an active one
        return selectChain([{ id: 'ref-1', status: 'active' }]);
      });

      const { createReferral } = await import('@/lib/referrals/service');
      const result = await createReferral('referred-1', 'valid-code');

      expect(result).toEqual({
        success: false,
        error: 'User already has an active referral',
      });
    });

    it('returns error for invalid referral code', async () => {
      mockDbSelect.mockImplementation(() => selectChain([]));

      const { createReferral } = await import('@/lib/referrals/service');
      const result = await createReferral('referred-1', 'nonexistent');

      expect(result).toEqual({
        success: false,
        error: 'Invalid referral code',
      });
    });

    it('handles unique constraint violation on insert gracefully', async () => {
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return selectChain([{ userId: 'referrer-1', id: 'code-id-1' }]);
        }
        return selectChain([]);
      });

      const uniqueError = new Error('duplicate key') as Error & {
        code: string;
      };
      uniqueError.code = '23505';
      const ins = insertChain({ shouldThrow: uniqueError });
      mockDbInsert.mockReturnValue(ins);

      const { createReferral } = await import('@/lib/referrals/service');
      const result = await createReferral('referred-1', 'valid-code');

      expect(result).toEqual({
        success: false,
        error: 'User already has an active referral',
      });
    });
  });

  // =========================================================================
  // activateReferral
  // =========================================================================
  describe('activateReferral', () => {
    it('activates a pending referral with correct expiry', async () => {
      const pendingRef = {
        id: 'ref-1',
        referrerUserId: 'referrer-1',
        referredUserId: 'referred-1',
        commissionDurationMonths: 24,
        commissionRateBps: 5000,
        status: 'pending',
        expiresAt: null,
      };

      const chain = selectChain([pendingRef]);
      mockDbSelect.mockReturnValue(chain);

      const upd = updateChain();
      mockDbUpdate.mockReturnValue(upd);

      const { activateReferral } = await import('@/lib/referrals/service');
      await activateReferral('referred-1');

      expect(mockDbUpdate).toHaveBeenCalled();
      // Verify the set() call included status: 'active' and dates
      const setCall = upd.set.mock.calls[0][0];
      expect(setCall.status).toBe('active');
      expect(setCall.subscribedAt).toBeInstanceOf(Date);
      expect(setCall.expiresAt).toBeInstanceOf(Date);
      // Expiry should be ~24 months in the future
      const monthsDiff =
        (setCall.expiresAt.getFullYear() - setCall.subscribedAt.getFullYear()) *
          12 +
        (setCall.expiresAt.getMonth() - setCall.subscribedAt.getMonth());
      expect(monthsDiff).toBe(24);
    });

    it('does nothing when no pending referral exists', async () => {
      const chain = selectChain([]);
      mockDbSelect.mockReturnValue(chain);

      const { activateReferral } = await import('@/lib/referrals/service');
      await activateReferral('no-referral-user');

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // recordCommission
  // =========================================================================
  describe('recordCommission', () => {
    const baseParams = {
      referredUserId: 'referred-1',
      stripeInvoiceId: 'in_123',
      paymentAmountCents: 2000,
      currency: 'usd',
    };

    it('returns existing commission for duplicate invoice (idempotency)', async () => {
      // First select: existing commission found
      const chain = selectChain([{ amountCents: 1000 }]);
      mockDbSelect.mockReturnValue(chain);

      const { recordCommission } = await import('@/lib/referrals/service');
      const result = await recordCommission(baseParams);

      expect(result).toEqual({ commissionCents: 1000 });
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it('records commission for active referral', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // No existing commission
          return selectChain([]);
        }
        // Active referral found
        return selectChain([
          {
            id: 'ref-1',
            referrerUserId: 'referrer-1',
            referredUserId: 'referred-1',
            commissionRateBps: 5000,
            commissionDurationMonths: 24,
            status: 'active',
            expiresAt: futureDate,
          },
        ]);
      });

      // Insert returns the created commission
      const ins = insertChain({ onConflictResult: [{ amountCents: 1000 }] });
      mockDbInsert.mockReturnValue(ins);

      const { recordCommission } = await import('@/lib/referrals/service');
      const result = await recordCommission(baseParams);

      // 2000 * 5000 / 10000 = 1000
      expect(result).toEqual({ commissionCents: 1000 });
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('returns null when no active referral exists', async () => {
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return selectChain([]); // no existing commission
        return selectChain([]); // no active referral
      });

      const { recordCommission } = await import('@/lib/referrals/service');
      const result = await recordCommission(baseParams);

      expect(result).toBeNull();
    });

    it('expires referral and returns null when commission period has ended', async () => {
      const pastDate = new Date('2020-01-01');

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return selectChain([]); // no existing commission
        return selectChain([
          {
            id: 'ref-1',
            referrerUserId: 'referrer-1',
            referredUserId: 'referred-1',
            commissionRateBps: 5000,
            commissionDurationMonths: 24,
            status: 'active',
            expiresAt: pastDate,
          },
        ]);
      });

      const upd = updateChain();
      mockDbUpdate.mockReturnValue(upd);

      const { recordCommission } = await import('@/lib/referrals/service');
      const result = await recordCommission(baseParams);

      expect(result).toBeNull();
      // Should have updated the referral status to expired
      expect(mockDbUpdate).toHaveBeenCalled();
      const setCall = upd.set.mock.calls[0][0];
      expect(setCall.status).toBe('expired');
    });

    it('handles conflict on insert gracefully (concurrent idempotency)', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return selectChain([]);
        return selectChain([
          {
            id: 'ref-1',
            referrerUserId: 'referrer-1',
            referredUserId: 'referred-1',
            commissionRateBps: 5000,
            commissionDurationMonths: 24,
            status: 'active',
            expiresAt: futureDate,
          },
        ]);
      });

      // Insert returns empty (conflict — another request won)
      const ins = insertChain({ onConflictResult: [] });
      mockDbInsert.mockReturnValue(ins);

      const { recordCommission } = await import('@/lib/referrals/service');
      const result = await recordCommission(baseParams);

      // Still returns commission (calculated), even though insert was a no-op
      expect(result).toEqual({ commissionCents: 1000 });
    });
  });

  // =========================================================================
  // expireReferralOnChurn
  // =========================================================================
  describe('expireReferralOnChurn', () => {
    it('marks active/pending referrals as churned', async () => {
      const upd = updateChain({
        returningValue: [{ id: 'ref-1' }, { id: 'ref-2' }],
      });
      mockDbUpdate.mockReturnValue(upd);

      const { expireReferralOnChurn } = await import('@/lib/referrals/service');
      await expireReferralOnChurn('referred-1');

      expect(mockDbUpdate).toHaveBeenCalled();
      const setCall = upd.set.mock.calls[0][0];
      expect(setCall.status).toBe('churned');
      expect(setCall.churnedAt).toBeInstanceOf(Date);
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Referral(s) marked as churned on cancellation',
        expect.objectContaining({
          referredUserId: 'referred-1',
          referralIds: ['ref-1', 'ref-2'],
        })
      );
    });

    it('does not log when no referrals were updated', async () => {
      const upd = updateChain({ returningValue: [] });
      mockDbUpdate.mockReturnValue(upd);

      const { expireReferralOnChurn } = await import('@/lib/referrals/service');
      await expireReferralOnChurn('no-referral-user');

      expect(mockLoggerInfo).not.toHaveBeenCalledWith(
        'Referral(s) marked as churned on cancellation',
        expect.anything()
      );
    });
  });

  // =========================================================================
  // getReferralStats
  // =========================================================================
  describe('getReferralStats', () => {
    it('aggregates statistics correctly', async () => {
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // User's referral code
          return selectChain([{ code: 'my-code' }]);
        }
        if (selectCallCount === 2) {
          // Referral counts by status
          return selectChain([
            { status: 'active', count: 5 },
            { status: 'pending', count: 2 },
            { status: 'churned', count: 1 },
            { status: 'expired', count: 3 },
          ]);
        }
        // Earnings by status
        return selectChain([
          { status: 'pending', total: 5000 },
          { status: 'approved', total: 3000 },
          { status: 'paid', total: 10000 },
        ]);
      });

      const { getReferralStats } = await import('@/lib/referrals/service');
      const stats = await getReferralStats('user-1');

      expect(stats).toEqual({
        referralCode: 'my-code',
        totalReferrals: 11, // 5 + 2 + 1 + 3
        activeReferrals: 5,
        pendingReferrals: 2,
        churnedReferrals: 1,
        totalEarningsCents: 18000, // 5000 + 3000 + 10000
        pendingEarningsCents: 5000,
        paidEarningsCents: 10000,
      });
    });

    it('returns zeroes when user has no referrals or earnings', async () => {
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return selectChain([]); // no code
        if (selectCallCount === 2) return selectChain([]); // no referrals
        return selectChain([]); // no earnings
      });

      const { getReferralStats } = await import('@/lib/referrals/service');
      const stats = await getReferralStats('user-1');

      expect(stats).toEqual({
        referralCode: null,
        totalReferrals: 0,
        activeReferrals: 0,
        pendingReferrals: 0,
        churnedReferrals: 0,
        totalEarningsCents: 0,
        pendingEarningsCents: 0,
        paidEarningsCents: 0,
      });
    });
  });

  // =========================================================================
  // getInternalUserId
  // =========================================================================
  describe('getInternalUserId', () => {
    it('returns internal user ID for a valid Clerk ID', async () => {
      const chain = selectChain([{ id: 'internal-123' }]);
      mockDbSelect.mockReturnValue(chain);

      const { getInternalUserId } = await import('@/lib/referrals/service');
      const result = await getInternalUserId('clerk_abc');

      expect(result).toBe('internal-123');
    });

    it('returns null when Clerk ID is not found', async () => {
      const chain = selectChain([]);
      mockDbSelect.mockReturnValue(chain);

      const { getInternalUserId } = await import('@/lib/referrals/service');
      const result = await getInternalUserId('clerk_nonexistent');

      expect(result).toBeNull();
    });
  });
});
