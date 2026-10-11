import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gateEnabled: true,
  waitlistAccess: {
    entryId: null as string | null,
    status: null as string | null,
  },
  insertedUser: { id: 'app-user-1' } as { id: string } | undefined,
  insertedValues: [] as Array<Record<string, unknown>>,
  ensureSignupWaitlistEntry: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: async () => mocks.gateEnabled,
}));
vi.mock('@/lib/auth/waitlist-access', () => ({
  getWaitlistAccess: async () => mocks.waitlistAccess,
}));
vi.mock('@/lib/waitlist/signup-entry', () => ({
  ensureSignupWaitlistEntry: mocks.ensureSignupWaitlistEntry,
}));
vi.mock('@/lib/db', () => ({
  db: {
    // findByBetterAuthId: nobody provisioned yet.
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
    // adoptByVerifiedEmail: no Clerk-era row to adopt.
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mocks.insertedValues.push(values);
        return {
          onConflictDoNothing: () => ({
            returning: async () =>
              mocks.insertedUser ? [mocks.insertedUser] : [],
          }),
        };
      },
    }),
  },
}));

const input = {
  betterAuthUserId: 'ba-user-1',
  email: 'New.Artist@Example.com',
  emailVerified: true,
  name: 'New Artist',
};

describe('provisionAppUser sign-up waitlist entry', () => {
  beforeEach(() => {
    mocks.gateEnabled = true;
    mocks.waitlistAccess = { entryId: null, status: null };
    mocks.insertedUser = { id: 'app-user-1' };
    mocks.insertedValues.length = 0;
    mocks.ensureSignupWaitlistEntry.mockReset();
  });

  it('gives a gated sign-up a waitlist entry so it can never be stranded', async () => {
    const { provisionAppUser } = await import('@/lib/auth/provision');

    await expect(provisionAppUser(input)).resolves.toBe('app-user-1');
    expect(mocks.insertedValues[0]).toMatchObject({
      userStatus: 'waitlist_pending',
    });
    expect(mocks.ensureSignupWaitlistEntry).toHaveBeenCalledWith(
      'new.artist@example.com'
    );
  });

  it('creates no entry when the gate is off', async () => {
    mocks.gateEnabled = false;
    const { provisionAppUser } = await import('@/lib/auth/provision');

    await provisionAppUser(input);
    expect(mocks.insertedValues[0]).toMatchObject({
      userStatus: 'waitlist_approved',
    });
    expect(mocks.ensureSignupWaitlistEntry).not.toHaveBeenCalled();
  });

  it('creates no entry for an already-approved waitlister', async () => {
    mocks.waitlistAccess = { entryId: 'entry-1', status: 'approved' };
    const { provisionAppUser } = await import('@/lib/auth/provision');

    await provisionAppUser(input);
    expect(mocks.insertedValues[0]).toMatchObject({
      userStatus: 'waitlist_approved',
    });
    expect(mocks.ensureSignupWaitlistEntry).not.toHaveBeenCalled();
  });
});
