import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignUpFlow } from '@/hooks/useSignUpFlow';

// --- Mocks ---

const pushMock = vi.fn();
const setActiveMock = vi.fn();

const createMock = vi.fn();
const prepareEmailVerificationMock = vi.fn();
const attemptEmailVerificationMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@clerk/nextjs', () => ({
  useSignUp: () => ({
    signUp: {
      create: createMock,
      prepareEmailAddressVerification: prepareEmailVerificationMock,
      attemptEmailAddressVerification: attemptEmailVerificationMock,
    },
    setActive: setActiveMock,
    isLoaded: true,
  }),
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: { DASHBOARD: '/app/dashboard' },
}));

vi.mock('@/constants/domains', () => ({
  APP_URL: 'https://jov.ie',
}));

// --- Helpers ---

async function setupVerificationStep(result: {
  current: ReturnType<typeof useSignUpFlow>;
}) {
  createMock.mockResolvedValue(undefined);
  prepareEmailVerificationMock.mockResolvedValue(undefined);

  await act(async () => {
    await result.current.startEmailFlow('test@example.com');
  });

  expect(result.current.step).toBe('verification');
}

// --- Tests ---

describe('useSignUpFlow – status handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveMock.mockResolvedValue(undefined);
  });

  it('shows specific message for abandoned status', async () => {
    const { result } = renderHook(() => useSignUpFlow());
    await setupVerificationStep(result);

    attemptEmailVerificationMock.mockResolvedValue({
      status: 'abandoned',
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(result.current.error).toBe(
      'Sign-up was interrupted. Please start over.'
    );
  });

  it('shows generic message for unknown status', async () => {
    const { result } = renderHook(() => useSignUpFlow());
    await setupVerificationStep(result);

    attemptEmailVerificationMock.mockResolvedValue({
      status: 'some_future_status',
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(result.current.error).toBe('Sign-up incomplete. Please try again.');
  });
});
