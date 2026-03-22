import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignUpFlow } from '@/hooks/useSignUpFlow';

// --- Mocks ---

const pushMock = vi.fn();
const setActiveMock = vi.fn();

const createMock = vi.fn();
const prepareEmailVerificationMock = vi.fn();
const attemptEmailVerificationMock = vi.fn();
const authenticateWithRedirectMock = vi.fn();
const signUpResource = {
  create: createMock,
  verifications: {
    sendEmailCode: prepareEmailVerificationMock,
    verifyEmailCode: attemptEmailVerificationMock,
  },
  finalize: setActiveMock,
  authenticateWithRedirect: authenticateWithRedirectMock,
  status: null as string | null,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@clerk/nextjs', () => ({
  useSignUp: () => ({
    fetchStatus: 'idle',
    errors: [],
    signUp: signUpResource,
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
  signUpResource.status = null;
  createMock.mockResolvedValue({ error: null });
  prepareEmailVerificationMock.mockResolvedValue({ error: null });

  await act(async () => {
    await result.current.startEmailFlow('test@example.com');
  });

  expect(result.current.step).toBe('verification');
}

// --- Tests ---

describe('useSignUpFlow – status handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUpResource.status = null;
    setActiveMock.mockResolvedValue({ error: null });
  });

  it('shows specific message for abandoned status', async () => {
    const { result } = renderHook(() => useSignUpFlow());
    await setupVerificationStep(result);

    attemptEmailVerificationMock.mockImplementation(async () => {
      signUpResource.status = 'abandoned';
      return { error: null };
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

    attemptEmailVerificationMock.mockImplementation(async () => {
      signUpResource.status = 'some_future_status';
      return { error: null };
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(result.current.error).toBe('Sign-up incomplete. Please try again.');
  });
});
