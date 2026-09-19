import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbExecute, mockCaptureError } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockCaptureError: vi.fn(),
}));

vi.mock('@/lib/db/client/connection', () => ({
  getDb: vi.fn(() => ({ execute: mockDbExecute })),
  getInternalDb: vi.fn(() => ({ execute: mockDbExecute })),
  initializeDb: vi.fn(() => ({ execute: mockDbExecute })),
  setInternalDb: vi.fn(),
}));
vi.mock('@/lib/db/client/logging', () => ({
  logDbError: vi.fn(),
  logDbInfo: vi.fn(),
}));
vi.mock('@/lib/db/client/retry', () => ({
  withRetry: vi.fn(async (operation: () => Promise<unknown>) => operation()),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));

function sqlText(sql: unknown): string {
  return JSON.stringify(sql);
}

describe('RLS identity pin (JOV-6267)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDbExecute.mockResolvedValue(undefined);
    mockCaptureError.mockResolvedValue(undefined);
  });

  it('pins is_local=true on one handle and fail-closes when set_config throws', async () => {
    const { applyRlsTransactionUser, getRlsTransactionSessionSetSql } =
      await import('@/lib/db/client/session');
    expect(sqlText(getRlsTransactionSessionSetSql('user-a'))).toContain(
      ', true)'
    );

    let identity = '';
    const tx = {
      execute: vi.fn(async (sql: unknown) => {
        const text = sqlText(sql);
        if (text.includes(', true)')) identity = 'user-a';
        return { rows: [{ clerk_user_id: identity }] };
      }),
    };
    await applyRlsTransactionUser(tx, 'user-a');
    expect((await tx.execute({}))?.rows[0]?.clerk_user_id).toBe('user-a');

    const failing = {
      execute: vi.fn(async () => {
        throw new Error('set_config unavailable');
      }),
    };
    await expect(applyRlsTransactionUser(failing, 'user-a')).rejects.toThrow(
      'set_config unavailable'
    );
  });

  it('deliberate-red unpinned helper does not bind the next pooled query', async () => {
    const identities = ['', ''];
    let cursor = 0;
    const pooled = {
      execute: vi.fn(async (sql: unknown) => {
        const index = cursor++ % 2;
        const text = sqlText(sql);
        if (text.includes(', false)')) identities[index] = 'user-a';
        return { rows: [{ clerk_user_id: identities[index] }] };
      }),
    };
    const {
      applyUnpinnedRlsSessionUser,
      getRlsIdentityReadSql,
      getRlsSessionSetSql,
    } = await import('@/lib/db/client/session');
    expect(sqlText(getRlsSessionSetSql('user-a'))).toContain(', false)');
    await applyUnpinnedRlsSessionUser(pooled, 'user-a');
    const read = await pooled.execute(getRlsIdentityReadSql());
    expect(identities[0]).toBe('user-a');
    expect(read.rows[0]?.clerk_user_id).toBe('');
  });

  it('rollback/retry reuse and fallback failure leave no actor', async () => {
    let identity = 'user-a';
    const tx = {
      execute: vi.fn(async () => ({ rows: [{ clerk_user_id: identity }] })),
      rollback: () => {
        identity = '';
      },
    };
    tx.rollback();
    expect((await tx.execute())?.rows[0]?.clerk_user_id).toBe('');

    const fallbackError = new Error('fallback set_config failed');
    mockDbExecute
      .mockRejectedValueOnce(new Error('primary set_config failed'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(fallbackError);
    const { applyUnpinnedRlsSessionUser } = await import(
      '@/lib/db/client/session'
    );
    await expect(
      applyUnpinnedRlsSessionUser({ execute: mockDbExecute }, 'user-fallback')
    ).rejects.toBe(fallbackError);
  });
});
