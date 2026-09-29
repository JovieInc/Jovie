import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  role: vi.fn(),
  mfa: vi.fn(),
  privacy: vi.fn(),
  ent: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: m.auth }));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: m.role }));
vi.mock('@/lib/admin/mfa', () => ({ hasRecentAdminMfaReverification: m.mfa }));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: m.ent,
}));
vi.mock('./server', async importOriginal => ({
  ...(await importOriginal<any>()),
  assertOviePrivacyUnlocked: m.privacy,
}));

import { getOvieOperatorEntitlements, requireOvieApiAccess } from './access';
import { OviePrivacyLockError } from './server';

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ userId: 'u1', sessionId: 's1' });
  m.role.mockResolvedValue(true);
  m.mfa.mockResolvedValue(false);
  m.privacy.mockResolvedValue(undefined);
  m.ent.mockResolvedValue({
    isAuthenticated: true,
    userId: 'u1',
    isAdmin: false,
    email: 'admin@example.com',
  });
});
describe('Ovie optional privacy and independent action authorization', () => {
  it('allows read access by baseline admin without mandatory12h passkey curtain', async () => {
    expect(await requireOvieApiAccess()).toBeNull();
    expect(m.mfa).not.toHaveBeenCalled();
    expect(m.privacy).toHaveBeenCalledWith({ userId: 'u1', sessionId: 's1' });
  });
  it('never grants privileged deployment from privacy alone', async () => {
    const res = await requireOvieApiAccess({ privileged: true });
    expect(res?.status).toBe(403);
    expect((await res!.json()).code).toBe('PASSKEY_STEP_UP_REQUIRED');
  });
  it('requires both valid privileged proof and privacy', async () => {
    m.mfa.mockResolvedValue(true);
    m.privacy.mockRejectedValue(
      new OviePrivacyLockError('PRIVACY_UNLOCK_REQUIRED', 'Locked')
    );
    expect((await requireOvieApiAccess({ privileged: true }))?.status).toBe(
      403
    );
  });
  it('never grants ordinary user role via privacy receipt', async () => {
    m.role.mockResolvedValue(false);
    expect((await requireOvieApiAccess())?.status).toBe(403);
    expect(m.privacy).not.toHaveBeenCalled();
  });
  it('rejects missing or revoked session', async () => {
    m.auth.mockResolvedValue({ userId: null, sessionId: null });
    expect((await requireOvieApiAccess())?.status).toBe(401);
  });
  it('fails closed on private-state DB outage', async () => {
    m.privacy.mockRejectedValue(Error('DB down'));
    const res = await requireOvieApiAccess();
    expect(res?.status).toBe(503);
    expect(res?.headers.get('cache-control')).toBe('private, no-store');
  });
  it('default scoped entitlements retain MFA semantics for writes', async () => {
    expect((await getOvieOperatorEntitlements()).isAdmin).toBe(false);
    expect(
      (await getOvieOperatorEntitlements({ session: 'cookie' })).isAdmin
    ).toBe(false);
  });
  it('explicit read scope unblocks optional browsing while preserving identity', async () => {
    const ent = await getOvieOperatorEntitlements({ purpose: 'read' });
    expect(ent.isAdmin).toBe(true);
    expect(ent.email).toBe('admin@example.com');
  });
  it('read scope never upgrades non-admin', async () => {
    m.role.mockResolvedValue(false);
    expect(
      (await getOvieOperatorEntitlements({ purpose: 'read' })).isAdmin
    ).toBe(false);
    expect(m.ent).toHaveBeenCalledWith({ session: 'fresh' });
    expect(m.privacy).not.toHaveBeenCalled();
  });
  it('read scope respects locked privacy', async () => {
    m.privacy.mockRejectedValue(
      new OviePrivacyLockError('PRIVACY_UNLOCK_REQUIRED', 'Locked')
    );
    await expect(
      getOvieOperatorEntitlements({ purpose: 'read' })
    ).rejects.toMatchObject({ code: 'PRIVACY_UNLOCK_REQUIRED' });
    expect(m.ent).not.toHaveBeenCalled();
  });
  it('checks admin privacy before loading private entitlement data', async () => {
    await getOvieOperatorEntitlements();
    expect(m.auth.mock.invocationCallOrder[0]).toBeLessThan(
      m.role.mock.invocationCallOrder[0]
    );
    expect(m.role.mock.invocationCallOrder[0]).toBeLessThan(
      m.privacy.mock.invocationCallOrder[0]
    );
    expect(m.privacy.mock.invocationCallOrder[0]).toBeLessThan(
      m.ent.mock.invocationCallOrder[0]
    );
  });
  it('does not load entitlement data when the privacy store fails', async () => {
    m.privacy.mockRejectedValue(Error('Privacy storage unavailable'));
    await expect(getOvieOperatorEntitlements()).rejects.toThrow(
      'Privacy storage unavailable'
    );
    expect(m.ent).not.toHaveBeenCalled();
  });
});
