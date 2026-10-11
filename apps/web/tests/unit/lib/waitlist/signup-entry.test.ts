import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertResult: [{ id: 'entry-1' }] as Array<{ id: string }> | Error,
  values: [] as unknown[],
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => {
        mocks.values.push(values);
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              if (mocks.insertResult instanceof Error) throw mocks.insertResult;
              return mocks.insertResult;
            },
          }),
        };
      },
    }),
  },
}));

describe('sign-up waitlist entry', () => {
  beforeEach(() => {
    mocks.insertResult = [{ id: 'entry-1' }];
    mocks.values.length = 0;
    mocks.captureError.mockReset();
  });

  it('builds a reviewable waitlisted entry with no invented profile data', async () => {
    const { buildSignupWaitlistEntryValues } = await import(
      '@/lib/waitlist/signup-entry'
    );
    const now = new Date('2026-10-04T00:00:00.000Z');
    const values = buildSignupWaitlistEntryValues(' Fan@Example.com ', now);

    expect(values).toMatchObject({
      email: 'fan@example.com',
      emailNormalized: 'fan@example.com',
      source: 'signup',
      canonical: true,
      status: 'waitlisted',
      waitlistedAt: now,
    });
    expect(values).not.toHaveProperty('fullName');
    expect(values).not.toHaveProperty('primarySocialUrl');
    expect(values.emailHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats only a pending sign-up entry as unqualified', async () => {
    const { isUnqualifiedSignupEntry } = await import(
      '@/lib/waitlist/signup-entry'
    );

    expect(
      isUnqualifiedSignupEntry({ source: 'signup', status: 'waitlisted' })
    ).toBe(true);
    expect(isUnqualifiedSignupEntry({ source: 'signup', status: 'new' })).toBe(
      true
    );
    expect(
      isUnqualifiedSignupEntry({ source: 'signup', status: 'approved' })
    ).toBe(false);
    expect(
      isUnqualifiedSignupEntry({
        source: 'onboarding_chat',
        status: 'waitlisted',
      })
    ).toBe(false);
  });

  it('never throws from provisioning, and reports a failed insert', async () => {
    mocks.insertResult = new Error('db down');
    const { ensureSignupWaitlistEntry } = await import(
      '@/lib/waitlist/signup-entry'
    );

    await expect(
      ensureSignupWaitlistEntry('fan@example.com')
    ).resolves.toBeUndefined();
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
  });

  it('skips a missing email', async () => {
    const { ensureSignupWaitlistEntry } = await import(
      '@/lib/waitlist/signup-entry'
    );

    await ensureSignupWaitlistEntry(null);
    expect(mocks.values).toHaveLength(0);
  });
});
