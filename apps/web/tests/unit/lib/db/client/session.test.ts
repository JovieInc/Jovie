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
    const { getRlsSessionResetSql } = await import('@/lib/db/client/session');

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

  it('applyRlsSessionUser falls back to parameterized set_config when the primary statement fails', async () => {
    const { applyRlsSessionUser } = await import('@/lib/db/client/session');
    const { logDbError } = await import('@/lib/db/client/logging');
    const db = { execute: mockDbExecute };
    const primaryError = new Error('connection terminated unexpectedly');

    mockDbExecute
      .mockRejectedValueOnce(primaryError) // primary clear+set fails
      .mockResolvedValueOnce(undefined) // resetRlsSession succeeds
      .mockResolvedValueOnce(undefined); // fallback succeeds

    await applyRlsSessionUser(db, 'user_fallback_123');

    expect(mockDbExecute).toHaveBeenCalledTimes(3);
    expect(logDbError).toHaveBeenCalledWith(
      'applyRlsSessionUser_set_config_failed',
      primaryError,
      { userId: 'user_fallback_123' }
    );

    // PostgreSQL rejects bind parameters on SET (see setStatementTimeout in
    // lib/db/query-timeout.ts), so the fallback must use parameterized
    // set_config — never `SET app.clerk_user_id = $1` (JOV-4241).
    const fallbackQueryText = JSON.stringify(mockDbExecute.mock.calls[2]?.[0]);
    expect(fallbackQueryText).toContain("set_config('app.clerk_user_id'");
    expect(fallbackQueryText).toContain('user_fallback_123');
    expect(fallbackQueryText).not.toContain('SET app.clerk_user_id');
  });

  it('applyRlsSessionUser propagates the fallback failure instead of hiding it', async () => {
    const { applyRlsSessionUser } = await import('@/lib/db/client/session');
    const db = { execute: mockDbExecute };
    const fallbackError = new Error('fallback set_config failed');

    mockDbExecute
      .mockRejectedValueOnce(new Error('primary set_config failed'))
      .mockResolvedValueOnce(undefined) // resetRlsSession succeeds
      .mockRejectedValueOnce(fallbackError);

    await expect(applyRlsSessionUser(db, 'user_fallback_123')).rejects.toBe(
      fallbackError
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
