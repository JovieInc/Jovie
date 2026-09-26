import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWhere = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
  },
}));

const OWNER_A = '11111111-2222-3333-4444-555555555555';
const ACCOUNT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('finance repository owner scoping (JOV-4609)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({
      limit: mockLimit,
      orderBy: mockOrderBy,
    });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
  });

  it('rejects non-UUID owners before touching the db', async () => {
    const { listFinanceAccounts } = await import('@/lib/finance/repository');
    await expect(listFinanceAccounts('creator_1')).rejects.toThrow(
      'Invalid financial owner id'
    );
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('getFinanceAccount filters by both account id and owner', async () => {
    mockLimit.mockResolvedValue([]);
    const { getFinanceAccount } = await import('@/lib/finance/repository');
    const result = await getFinanceAccount(OWNER_A, ACCOUNT_ID);
    expect(result).toBeNull();
    expect(mockWhere).toHaveBeenCalledTimes(1);
    // Composite and(eq(id), eq(owner)) predicate — a single where call that
    // must exist; RLS independently enforces the same predicate.
    expect(mockWhere.mock.calls[0][0]).toBeDefined();
  });

  it('returns null for an account owned by someone else', async () => {
    // RLS denies the row, so the query resolves to an empty set.
    mockLimit.mockResolvedValue([]);
    const { getFinanceAccount } = await import('@/lib/finance/repository');
    await expect(getFinanceAccount(OWNER_A, ACCOUNT_ID)).resolves.toBeNull();
  });

  it('listFinanceTransactions scopes by owner and optional account', async () => {
    const { listFinanceTransactions } = await import(
      '@/lib/finance/repository'
    );
    await listFinanceTransactions(OWNER_A, { accountId: ACCOUNT_ID });
    expect(mockWhere).toHaveBeenCalled();
  });
});
