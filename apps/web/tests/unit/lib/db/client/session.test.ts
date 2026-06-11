import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbExecute } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
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

describe('lib/db/client/session RLS helpers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDbExecute.mockResolvedValue(undefined);
  });

  it('getRlsSessionResetSql clears app.clerk_user_id', async () => {
    const { getRlsSessionResetSql } = await import(
      '@/lib/db/client/session'
    );

    const sql = getRlsSessionResetSql();
    expect(JSON.stringify(sql)).toContain("set_config('app.clerk_user_id'");
    expect(JSON.stringify(sql)).toContain("''");
  });

  it('getRlsSessionSetSql resets then sets app.clerk_user_id', async () => {
    const { getRlsSessionSetSql } = await import('@/lib/db/client/session');

    const sql = getRlsSessionSetSql('user_pool_reset_123');
    const queryText = JSON.stringify(sql);

    expect(queryText).toContain('user_pool_reset_123');
    expect(queryText).toMatch(
      /set_config\('app\.clerk_user_id'.*false.*set_config\('app\.clerk_user_id'/
    );
  });

  it('applyRlsSessionUser clears stale identity before setting user', async () => {
    const { applyRlsSessionUser } = await import('@/lib/db/client/session');
    const db = { execute: mockDbExecute };

    await applyRlsSessionUser(db, 'user_fresh_456');

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    const queryText = JSON.stringify(mockDbExecute.mock.calls[0]?.[0]);
    expect(queryText).toContain('user_fresh_456');
    expect(queryText).toMatch(
      /set_config\('app\.clerk_user_id'.*false.*set_config\('app\.clerk_user_id'/
    );
  });

  it('resetRlsSession clears app.clerk_user_id on pooled reuse', async () => {
    const { resetRlsSession } = await import('@/lib/db/client/session');
    const db = { execute: mockDbExecute };

    await resetRlsSession(db);

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    const queryText = JSON.stringify(mockDbExecute.mock.calls[0]?.[0]);
    expect(queryText).toContain("set_config('app.clerk_user_id'");
    expect(queryText).toContain("''");
  });

  it('setSessionUser clears RLS when userId is empty', async () => {
    const { setSessionUser } = await import('@/lib/db/client/session');

    await setSessionUser('');

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    const queryText = JSON.stringify(mockDbExecute.mock.calls[0]?.[0]);
    expect(queryText).toContain("set_config('app.clerk_user_id'");
    expect(queryText).toContain("''");
  });

  it('setSessionUser resets then sets identity for authenticated users', async () => {
    const { setSessionUser } = await import('@/lib/db/client/session');

    await setSessionUser('user_authenticated_789');

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    const queryText = JSON.stringify(mockDbExecute.mock.calls[0]?.[0]);
    expect(queryText).toContain('user_authenticated_789');
    expect(queryText).toMatch(
      /set_config\('app\.clerk_user_id'.*false.*set_config\('app\.clerk_user_id'/
    );
  });
});