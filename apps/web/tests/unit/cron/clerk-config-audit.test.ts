import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

// Real Clerk publishable keys are `pk_(live|test)_<base64>` where the base64
// decodes to `<fapi-host>$`. Build a fake one so `decodeFapiHostFromPublishableKey`
// returns a predictable host.
function makePublishableKey(fapiHost: string, env: 'live' | 'test' = 'live') {
  const encoded = Buffer.from(`${fapiHost}$`).toString('base64');
  return `pk_${env}_${encoded}`;
}

const PROD_KEY = makePublishableKey('clerk.jov.ie');
const STAGING_KEY = makePublishableKey('clerk.staging.jov.ie');

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PROD_KEY;
  process.env.CLERK_PUBLISHABLE_KEY_STAGING = STAGING_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

async function loadAuditClerkInstances() {
  // Re-import to pick up env changes if any test alters config.
  vi.resetModules();
  const mod = await import('@/app/api/cron/clerk-config-audit/route');
  return mod.auditClerkInstances;
}

function mockFetchSequence(
  responses: ReadonlyArray<{ ok: boolean; status?: number; body: unknown }>
) {
  let index = 0;
  globalThis.fetch = vi.fn(async () => {
    const next = responses[index++];
    if (!next) throw new Error('mockFetchSequence ran out of responses');
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? (next.ok ? 200 : 500),
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('clerk-config-audit cron', () => {
  it('reports ok when both instances expose only OAuth first-factor strategies', async () => {
    const audit = await loadAuditClerkInstances();

    mockFetchSequence([
      {
        ok: true,
        body: {
          auth_config: {
            first_factors: ['oauth_google', 'oauth_apple'],
            identification_requirements: [],
          },
        },
      },
      {
        ok: true,
        body: {
          auth_config: {
            first_factors: ['oauth_google', 'oauth_apple'],
            identification_requirements: [],
          },
        },
      },
    ]);

    const outcome = await audit();

    expect(outcome.ok).toBe(true);
    expect(outcome.violations).toHaveLength(0);
    expect(outcome.results.map(r => r.label).sort()).toEqual([
      'production',
      'staging',
    ]);
    expect(outcome.results.every(r => r.probed)).toBe(true);
  });

  it('flags `password` as a forbidden first-factor strategy', async () => {
    const audit = await loadAuditClerkInstances();

    mockFetchSequence([
      {
        ok: true,
        body: {
          auth_config: {
            first_factors: ['oauth_google', 'oauth_apple', 'password'],
            identification_requirements: ['email_address'],
          },
        },
      },
      {
        ok: true,
        body: {
          auth_config: {
            first_factors: ['oauth_google', 'oauth_apple'],
            identification_requirements: [],
          },
        },
      },
    ]);

    const outcome = await audit();

    expect(outcome.ok).toBe(false);
    expect(outcome.violations).toHaveLength(1);
    expect(outcome.violations[0]?.label).toBe('production');
    expect(outcome.violations[0]?.forbiddenStrategies).toContain('password');
    expect(outcome.violations[0]?.forbiddenIdentifications).toContain(
      'email_address'
    );
  });

  it('flags `email_code` (OTP signup regression scenario)', async () => {
    const audit = await loadAuditClerkInstances();

    mockFetchSequence([
      {
        ok: true,
        body: {
          auth_config: {
            first_factors: ['oauth_google', 'oauth_apple'],
          },
        },
      },
      {
        ok: true,
        body: {
          auth_config: {
            first_factors: ['oauth_google', 'oauth_apple', 'email_code'],
            identification_requirements: ['email_address'],
          },
        },
      },
    ]);

    const outcome = await audit();

    expect(outcome.ok).toBe(false);
    expect(outcome.violations).toHaveLength(1);
    expect(outcome.violations[0]?.label).toBe('staging');
    expect(outcome.violations[0]?.forbiddenStrategies).toContain('email_code');
  });

  it('derives first-factor strategies from `user_settings.attributes` when `auth_config.first_factors` is absent', async () => {
    const audit = await loadAuditClerkInstances();

    mockFetchSequence([
      {
        ok: true,
        body: {
          user_settings: {
            attributes: {
              email_address: {
                enabled: true,
                used_for_first_factor: true,
                verifications: ['email_code'],
              },
              password: {
                enabled: true,
                used_for_first_factor: true,
                verifications: [],
              },
            },
          },
        },
      },
      {
        ok: true,
        body: {
          user_settings: {
            attributes: {},
          },
        },
      },
    ]);

    const outcome = await audit();

    expect(outcome.ok).toBe(false);
    const prod = outcome.violations.find(v => v.label === 'production');
    expect(prod).toBeDefined();
    expect(prod?.forbiddenStrategies).toEqual(
      expect.arrayContaining(['email_code', 'password'])
    );
    expect(prod?.forbiddenIdentifications).toContain('email_address');
  });

  it('records probe errors without crashing when a FAPI host returns 500', async () => {
    const audit = await loadAuditClerkInstances();

    mockFetchSequence([
      { ok: false, status: 500, body: { error: 'boom' } },
      { ok: false, status: 500, body: { error: 'boom' } },
      { ok: false, status: 500, body: { error: 'boom' } },
      {
        ok: true,
        body: { auth_config: { first_factors: ['oauth_google'] } },
      },
    ]);

    const outcome = await audit();

    expect(outcome.ok).toBe(false); // Probe failure means loss of audit coverage (no longer silently reports success).
    const prod = outcome.results.find(r => r.label === 'production');
    expect(prod?.probed).toBe(false);
    expect(prod?.error).toBeDefined();
  });

  it('skips instances with no publishable key configured', async () => {
    delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    const audit = await loadAuditClerkInstances();

    mockFetchSequence([
      {
        ok: true,
        body: { auth_config: { first_factors: ['oauth_google'] } },
      },
    ]);

    const outcome = await audit();

    expect(outcome.ok).toBe(false);
    const staging = outcome.results.find(r => r.label === 'staging');
    expect(staging?.probed).toBe(false);
    expect(staging?.error).toBe('publishable_key_missing');
  });

  it('rejects keys whose FAPI host fails to decode', async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_not-base64!!!';
    const audit = await loadAuditClerkInstances();

    mockFetchSequence([
      {
        ok: true,
        body: { auth_config: { first_factors: ['oauth_google'] } },
      },
    ]);

    const outcome = await audit();

    const prod = outcome.results.find(r => r.label === 'production');
    expect(prod?.probed).toBe(false);
    expect(prod?.error).toBe('fapi_host_decode_failed');
  });
});
