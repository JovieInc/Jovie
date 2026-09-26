import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string }>,
  fail: false,
  reads: 0,
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
  },
}));

import {
  adminStepUpIdentifier,
  hasRecentAdminMfaReverification,
} from '@/lib/admin/mfa';

describe('hasRecentAdminMfaReverification', () => {
  beforeEach(() => {
    state.rows = [];
    state.fail = false;
    state.reads = 0;
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
});
