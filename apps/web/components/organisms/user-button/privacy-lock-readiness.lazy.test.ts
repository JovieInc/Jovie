import { describe, expect, it, vi } from 'vitest';

const ensure = vi.fn(async () => {});
vi.mock('@/lib/workspace-lock/unlock-with-passkey', () => ({
  ensurePrivacyLockCanBeEnabled: ensure,
}));

import { ensurePrivacyLockCanBeEnabled } from './privacy-lock-readiness.lazy';

describe('ensurePrivacyLockCanBeEnabled (lazy)', () => {
  it('loads the passkey module on demand and runs its readiness check', async () => {
    await ensurePrivacyLockCanBeEnabled();
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it('passes the readiness failure through to the lock control', async () => {
    ensure.mockRejectedValueOnce(new Error('setup-required'));
    await expect(ensurePrivacyLockCanBeEnabled()).rejects.toThrow(
      'setup-required'
    );
  });
});
