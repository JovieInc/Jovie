import { beforeEach, describe, expect, it, vi } from 'vitest';

// Track deleted cookie names
let deletedCookies: string[] = [];
let mockAllCookies: Array<{ name: string; value: string }> = [];

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(async () => ({
    getAll: () => mockAllCookies,
    delete: (name: string) => {
      deletedCookies.push(name);
    },
  })),
}));

// Import after mocks
const { POST } = await import('@/app/api/dev/clear-session/route');

describe('POST /api/dev/clear-session', () => {
  beforeEach(() => {
    deletedCookies = [];
    mockAllCookies = [];
    vi.unstubAllEnvs();
  });

  it('returns 403 in production environment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const res = await POST();
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not available in production');
  });

  it('returns 200 with deleted cookie names in non-production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: '__session', value: 'abc' },
      { name: '__clerk_db_jwt', value: 'xyz' },
      { name: 'jv_country', value: 'US' },
    ];

    const res = await POST();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deleted).toEqual(
      expect.arrayContaining(['__session', '__clerk_db_jwt', 'jv_country'])
    );
  });

  it('has Cache-Control: no-store header', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    const res = await POST();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('deletes Clerk cookies by prefix including suffixed variants', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: '__session', value: '1' },
      { name: '__session_abc123', value: '2' },
      { name: '__clerk_handshake', value: '3' },
      { name: '__clerk_redirect_count', value: '4' },
      { name: '__client_uat', value: '5' },
      { name: '__refresh', value: '6' },
    ];

    await POST();
    expect(deletedCookies).toEqual(
      expect.arrayContaining([
        '__session',
        '__session_abc123',
        '__clerk_handshake',
        '__clerk_redirect_count',
        '__client_uat',
        '__refresh',
      ])
    );
  });

  it('deletes explicit app cookies', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: 'jv_cc', value: '1' },
      { name: 'jv_aid', value: '2' },
      { name: 'jovie_onboarding_complete', value: '3' },
      { name: 'jovie_impersonate', value: '4' },
      { name: '__investor_token', value: '5' },
    ];

    await POST();
    expect(deletedCookies).toEqual(
      expect.arrayContaining([
        'jv_cc',
        'jv_aid',
        'jovie_onboarding_complete',
        'jovie_impersonate',
        '__investor_token',
      ])
    );
  });

  it('does NOT delete __dev_toolbar cookie', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: '__dev_toolbar', value: '1' },
      { name: '__session', value: '2' },
    ];

    await POST();
    expect(deletedCookies).not.toContain('__dev_toolbar');
    expect(deletedCookies).toContain('__session');
  });

  it('ignores cookies that are neither Clerk nor app cookies', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: 'some_random_cookie', value: '1' },
      { name: '__session', value: '2' },
    ];

    await POST();
    expect(deletedCookies).not.toContain('some_random_cookie');
    expect(deletedCookies).toContain('__session');
  });
});
