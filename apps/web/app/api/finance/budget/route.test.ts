import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getAppFlagValue: vi.fn(),
  listBudgetTargets: vi.fn(),
  listBudgetMonthTransactions: vi.fn(),
  getBudgetSettings: vi.fn(),
  upsertBudgetTarget: vi.fn(),
  upsertBudgetSettings: vi.fn(),
  deleteBudgetTarget: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: mocks.getAppFlagValue,
}));
vi.mock('@/lib/finance/budget-repository', () => ({
  listBudgetTargets: mocks.listBudgetTargets,
  listBudgetMonthTransactions: mocks.listBudgetMonthTransactions,
  getBudgetSettings: mocks.getBudgetSettings,
  upsertBudgetTarget: mocks.upsertBudgetTarget,
  upsertBudgetSettings: mocks.upsertBudgetSettings,
  deleteBudgetTarget: mocks.deleteBudgetTarget,
}));

import { DELETE, GET, PUT } from './route';

const OWNER = '11111111-2222-3333-4444-555555555555';
const OTHER_USER = '99999999-8888-7777-6666-555555555555';

function req(url: string, init?: RequestInit) {
  return new Request(`http://localhost/api/finance/budget${url}`, init);
}

describe('finance budget route (JOV-4620)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: OWNER });
    mocks.getAppFlagValue.mockResolvedValue(true);
    mocks.listBudgetTargets.mockResolvedValue([]);
    mocks.listBudgetMonthTransactions.mockResolvedValue([]);
    mocks.getBudgetSettings.mockResolvedValue(null);
  });

  it('returns 401 for unauthenticated reads and writes', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: null });
    expect((await GET(req('?month=2026-10'))).status).toBe(401);
    expect(
      (
        await PUT(
          req('', {
            method: 'PUT',
            body: JSON.stringify({ targets: [] }),
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await DELETE(
          req('', {
            method: 'DELETE',
            body: JSON.stringify({
              category: 'creator_income',
              month: 'baseline',
            }),
          })
        )
      ).status
    ).toBe(401);
    expect(mocks.listBudgetTargets).not.toHaveBeenCalled();
    expect(mocks.upsertBudgetTarget).not.toHaveBeenCalled();
  });

  it('returns 404 when the feature flag is off (absent-indistinguishable)', async () => {
    mocks.getAppFlagValue.mockResolvedValue(false);
    const res = await GET(req('?month=2026-10'));
    expect(res.status).toBe(404);
    expect(mocks.listBudgetTargets).not.toHaveBeenCalled();
  });

  it('never accepts an owner parameter — the session identity is the owner', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: OTHER_USER });
    await GET(req('?month=2026-10&ownerUserId=' + OWNER));
    expect(mocks.listBudgetTargets).toHaveBeenCalledWith(OTHER_USER, '2026-10');
  });

  it('rejects invalid month formats', async () => {
    expect((await GET(req('?month=2026-13'))).status).toBe(400);
    expect(mocks.listBudgetTargets).not.toHaveBeenCalled();
  });

  it('returns a summarized budget for the owner', async () => {
    mocks.listBudgetTargets.mockResolvedValue([
      {
        id: 't1',
        ownerUserId: OWNER,
        category: 'creator_income',
        month: 'baseline',
        targetAmount: '3000',
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mocks.listBudgetMonthTransactions.mockResolvedValue([
      {
        id: 'x1',
        ownerUserId: OWNER,
        accountId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        providerTransactionId: null,
        amount: '-1500',
        currency: 'USD',
        occurredAt: new Date('2026-10-05T00:00:00Z'),
        merchantName: null,
        description: null,
        category: 'royalties',
        pending: 'false',
        createdAt: new Date(),
      },
    ]);
    const res = await GET(req('?month=2026-10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const line = body.budget.lines.find(
      (l: { category: string }) => l.category === 'creator_income'
    );
    expect(line.target).toBe(3000);
    expect(line.actual).toBe(1500);
    expect(line.direction).toBe('unfavorable');
  });

  it('upserts targets only for the session owner', async () => {
    const res = await PUT(
      req('', {
        method: 'PUT',
        body: JSON.stringify({
          targets: [
            { category: 'creator_income', month: 'baseline', amount: 3000 },
            { category: 'personal_essentials', month: '2026-10', amount: 2200 },
          ],
          includedAccountIds: ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.upsertBudgetTarget).toHaveBeenCalledTimes(2);
    expect(mocks.upsertBudgetTarget).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({ category: 'personal_essentials' })
    );
    expect(mocks.upsertBudgetSettings).toHaveBeenCalledWith(OWNER, {
      includedAccountIds: ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],
    });
  });

  it('rejects invalid PUT bodies without writes', async () => {
    const res = await PUT(
      req('', {
        method: 'PUT',
        body: JSON.stringify({
          targets: [{ category: 'yachts', month: 'baseline', amount: 1 }],
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.upsertBudgetTarget).not.toHaveBeenCalled();
  });

  it('deletes only owner-scoped targets', async () => {
    const res = await DELETE(
      req('', {
        method: 'DELETE',
        body: JSON.stringify({
          category: 'personal_essentials',
          month: '2026-10',
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteBudgetTarget).toHaveBeenCalledWith(OWNER, {
      category: 'personal_essentials',
      month: '2026-10',
    });
  });
});
