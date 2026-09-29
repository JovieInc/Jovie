import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  role: vi.fn(),
  state: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: m.auth }));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn(),
}));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: m.role }));
vi.mock('@/lib/ovie/privacy-lock/server', async importOriginal => ({
  ...(await importOriginal<any>()),
  getOviePrivacyLockState: m.state,
  mutateOviePrivacyLock: m.mutate,
}));

import { OviePrivacyLockError } from '@/lib/ovie/privacy-lock/server';
import { GET, POST } from './route';

const state = { enabled: false, locked: false, unlockedUntil: null };
const request = (action: unknown, origin: string | null = 'https://jov.ie') =>
  new Request('https://jov.ie/api/ovie/privacy-lock', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ action }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ userId: 'u1', sessionId: 's1' });
  m.role.mockResolvedValue(true);
  m.state.mockResolvedValue(state);
  m.mutate.mockResolvedValue(state);
});
describe('privacy recovery/settings endpoint', () => {
  it('returns default off without mandatory passkey lock', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(state);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
  it('requires fresh session for reads and mutations', async () => {
    await GET();
    await POST(request('enable'));
    expect(m.auth).toHaveBeenCalledTimes(2);
    expect(m.mutate).toHaveBeenCalledWith(
      { userId: 'u1', sessionId: 's1' },
      'enable'
    );
  });
  it.each(['enable', 'lock', 'unlock', 'disable'])(
    'routes action%s using server-authenticated identity',
    async action => {
      expect((await POST(request(action))).status).toBe(200);
      expect(m.mutate).toHaveBeenCalledWith(
        { userId: 'u1', sessionId: 's1' },
        action
      );
    }
  );
  it.each(['https://evil.test', null])(
    'rejects cross/missing origin%s before any mutation',
    async origin => {
      expect((await POST(request('disable', origin))).status).toBe(403);
      expect(m.mutate).not.toHaveBeenCalled();
      expect(m.auth).not.toHaveBeenCalled();
    }
  );
  it('rejects invalid action', async () => {
    expect((await POST(request('bypass'))).status).toBe(400);
    expect(m.mutate).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated sessions', async () => {
    m.auth.mockResolvedValue({ userId: null, sessionId: null });
    expect((await GET()).status).toBe(401);
  });
  it('rejects non-admin privacy access', async () => {
    m.role.mockResolvedValue(false);
    expect((await POST(request('enable'))).status).toBe(403);
    expect(m.mutate).not.toHaveBeenCalled();
  });
  it('preserves recovery endpoint access while server requires proof to unlock', async () => {
    m.mutate.mockRejectedValue(
      new OviePrivacyLockError('PASSKEY_STEP_UP_REQUIRED', 'Verify passkey')
    );
    const res = await POST(request('unlock'));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PASSKEY_STEP_UP_REQUIRED');
  });
  it('returns503 without claiming persistence on failure', async () => {
    m.mutate.mockRejectedValue(Error('DB down'));
    expect((await POST(request('lock'))).status).toBe(503);
  });
});
