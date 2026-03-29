import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { clerkId: 'clerkId', email: 'email' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', usernameNormalized: 'usernameNormalized' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/errors/onboarding', () => ({
  createOnboardingError: vi.fn((code: string, message: string) => ({
    code,
    message,
  })),
  OnboardingErrorCode: {
    EMAIL_IN_USE: 'EMAIL_IN_USE',
    USERNAME_TAKEN: 'USERNAME_TAKEN',
  },
  onboardingErrorToError: vi.fn((err: { code: string; message: string }) => {
    return new Error(`[${err.code}] ${err.message}`);
  }),
}));

function createMockTx() {
  const limitMock = vi.fn();
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return { select: selectMock, limitMock, whereMock };
}

describe('ensureEmailAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when email is not in use', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([]);

    const { ensureEmailAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureEmailAvailable(tx as any, 'clerk_123', 'new@test.com')
    ).resolves.toBeUndefined();
  });

  it('passes when email belongs to the same user', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([{ clerkId: 'clerk_123' }]);

    const { ensureEmailAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureEmailAvailable(tx as any, 'clerk_123', 'existing@test.com')
    ).resolves.toBeUndefined();
  });

  it('throws EMAIL_IN_USE when email belongs to another user', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([{ clerkId: 'other_user' }]);

    const { ensureEmailAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureEmailAvailable(tx as any, 'clerk_123', 'taken@test.com')
    ).rejects.toThrow('[EMAIL_IN_USE]');
  });

  it('reports unexpected DB errors to Sentry', async () => {
    const tx = createMockTx();
    tx.limitMock.mockRejectedValue(new Error('Connection refused'));

    const { ensureEmailAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureEmailAvailable(tx as any, 'clerk_123', 'test@test.com')
    ).rejects.toThrow('Connection refused');

    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'ensureEmailAvailable failed',
      expect.any(Error),
      expect.objectContaining({ route: 'onboarding-validation' })
    );
  });

  it('does not report EMAIL_IN_USE to Sentry', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([{ clerkId: 'other_user' }]);

    const { ensureEmailAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureEmailAvailable(tx as any, 'clerk_123', 'taken@test.com')
    ).rejects.toThrow();

    expect(hoisted.captureErrorMock).not.toHaveBeenCalled();
  });
});

describe('ensureHandleAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when handle is not in use', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([]);

    const { ensureHandleAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureHandleAvailable(tx as any, 'newartist')
    ).resolves.toBeUndefined();
  });

  it('passes when handle belongs to the same profile', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([{ id: 'profile_123' }]);

    const { ensureHandleAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureHandleAvailable(tx as any, 'myhandle', 'profile_123')
    ).resolves.toBeUndefined();
  });

  it('throws USERNAME_TAKEN when handle belongs to another profile', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([{ id: 'other_profile' }]);

    const { ensureHandleAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureHandleAvailable(tx as any, 'takenhandle')
    ).rejects.toThrow('[USERNAME_TAKEN]');
  });

  it('throws USERNAME_TAKEN when profileId differs', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([{ id: 'other_profile' }]);

    const { ensureHandleAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureHandleAvailable(tx as any, 'takenhandle', 'my_profile')
    ).rejects.toThrow('[USERNAME_TAKEN]');
  });

  it('reports unexpected DB errors to Sentry', async () => {
    const tx = createMockTx();
    tx.limitMock.mockRejectedValue(new Error('Timeout'));

    const { ensureHandleAvailable } = await import(
      '@/app/onboarding/actions/validation'
    );
    await expect(
      ensureHandleAvailable(tx as any, 'somehandle')
    ).rejects.toThrow('Timeout');

    expect(hoisted.captureErrorMock).toHaveBeenCalled();
  });
});
