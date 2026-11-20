import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string }>,
  fail: false,
  reads: 0,
  inserts: [] as Array<Record<string, unknown>>,
  synthetic: false,
}));

vi.mock('@/lib/e2e/runtime', () => ({
  isVisualCaptureSyntheticAuthEnabled: () => state.synthetic,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            state.reads += 1;
            if (state.fail) throw new Error('db down');
            return state.rows;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return {
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
  },
}));

import {
  adminStepUpIdentifier,
  hasRecentAdminMfaReverification,
  seedAdminMfaStepUpForBypassUser,
  seedAdminMfaStepUpReceipt,
} from '@/lib/admin/mfa';

describe('hasRecentAdminMfaReverification', () => {
  beforeEach(() => {
    state.rows = [];
    state.fail = false;
    state.reads = 0;
    state.inserts = [];
    state.synthetic = false;
  });

  it('fails closed without a session id', async () => {
    expect(await hasRecentAdminMfaReverification(null)).toBe(false);
    expect(await hasRecentAdminMfaReverification({ sessionId: null })).toBe(
      false
    );
    expect(state.reads).toBe(0);
  });

  it('passes when this session has an unexpired passkey step-up receipt', async () => {
    state.rows = [{ id: 'v1' }];
    expect(await hasRecentAdminMfaReverification({ sessionId: 'ses_1' })).toBe(
      true
    );
  });

  it('fails when no live receipt exists for this session', async () => {
    expect(await hasRecentAdminMfaReverification({ sessionId: 'ses_1' })).toBe(
      false
    );
  });

  it('fails closed when the receipt read throws', async () => {
    state.fail = true;
    expect(await hasRecentAdminMfaReverification({ sessionId: 'ses_1' })).toBe(
      false
    );
  });

  it('scopes receipts to one session', () => {
    expect(adminStepUpIdentifier('ses_1')).toBe('admin-step-up:ses_1');
  });

  it('exempts only visual-capture bypass session ids (no DB)', async () => {
    state.synthetic = true;
    expect(
      await hasRecentAdminMfaReverification({
        sessionId: 'sess_test_bypass_admin',
      })
    ).toBe(true);
    expect(state.reads).toBe(0);
    expect(
      await hasRecentAdminMfaReverification({ sessionId: 'sess_prod_real' })
    ).toBe(false);
  });
});

describe('seedAdminMfaStepUpReceipt', () => {
  beforeEach(() => {
    state.inserts = [];
  });

  it('writes a deterministic live receipt for the bypass session id', async () => {
    await seedAdminMfaStepUpForBypassUser('db_admin');
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      id: 'admin-step-up:sess_test_bypass_db_admin',
      identifier: 'admin-step-up:sess_test_bypass_db_admin',
    });
    expect(state.inserts[0]?.expiresAt).toBeInstanceOf(Date);
  });

  it('no-ops without a session id', async () => {
    await seedAdminMfaStepUpReceipt('');
    expect(state.inserts).toHaveLength(0);
  });
});
