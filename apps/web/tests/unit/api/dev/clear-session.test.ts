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
    expect(body.error).toBe('Not available outside development');
  });

  it('returns 403 on preview deployments', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    const res = await POST();
    expect(res.status).toBe(403);
  });

  it('returns 200 with deleted cookie names in non-production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: 'better-auth.session_token', value: 'abc' },
      { name: '__Secure-better-auth.session_token', value: 'xyz' },
      { name: 'jv_country', value: 'US' },
    ];

    const res = await POST();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deleted).toEqual(
      expect.arrayContaining([
        'better-auth.session_token',
        '__Secure-better-auth.session_token',
        'jv_country',
      ])
    );
  });

  it('has Cache-Control: no-store header', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    const res = await POST();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('deletes Better Auth cookies by prefix including secure variants', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: 'better-auth.session_token', value: '1' },
      { name: 'better-auth.session_token_0', value: '2' },
      { name: '__Secure-better-auth.session_token', value: '3' },
      { name: '__Host-better-auth.session_data', value: '4' },
    ];

    await POST();
    expect(deletedCookies).toEqual(
      expect.arrayContaining([
        'better-auth.session_token',
        'better-auth.session_token_0',
        '__Secure-better-auth.session_token',
        '__Host-better-auth.session_data',
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
      { name: '__e2e_test_persona', value: 'creator' },
    ];

    await POST();
    expect(deletedCookies).toEqual(
      expect.arrayContaining([
        'jv_cc',
        'jv_aid',
        'jovie_onboarding_complete',
        'jovie_impersonate',
        '__investor_token',
        '__e2e_test_persona',
      ])
    );
  });

  it('does NOT delete __dev_toolbar cookie', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: '__dev_toolbar', value: '1' },
      { name: 'better-auth.session_token', value: '2' },
    ];

    await POST();
    expect(deletedCookies).not.toContain('__dev_toolbar');
    expect(deletedCookies).toContain('better-auth.session_token');
  });

  it('ignores cookies that are neither Better Auth nor app cookies', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockAllCookies = [
      { name: 'some_random_cookie', value: '1' },
      { name: 'better-auth.session_token', value: '2' },
    ];

    await POST();
    expect(deletedCookies).not.toContain('some_random_cookie');
    expect(deletedCookies).toContain('better-auth.session_token');
  });
});
