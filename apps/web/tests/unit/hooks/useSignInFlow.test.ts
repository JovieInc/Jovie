import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignInFlow } from '@/hooks/useSignInFlow';

// --- Mocks ---

const pushMock = vi.fn();
const finalizeMock = vi.fn();

const createMock = vi.fn();
const sendFirstFactorCodeMock = vi.fn();
const verifyFirstFactorCodeMock = vi.fn();
const sendSecondFactorEmailCodeMock = vi.fn();
const verifySecondFactorEmailCodeMock = vi.fn();
const sendSecondFactorPhoneCodeMock = vi.fn();
const verifySecondFactorPhoneCodeMock = vi.fn();

const signInMock = {
  create: createMock,
  emailCode: {
    sendCode: sendFirstFactorCodeMock,
    verifyCode: verifyFirstFactorCodeMock,
  },
  mfa: {
    sendEmailCode: sendSecondFactorEmailCodeMock,
    verifyEmailCode: verifySecondFactorEmailCodeMock,
    sendPhoneCode: sendSecondFactorPhoneCodeMock,
    verifyPhoneCode: verifySecondFactorPhoneCodeMock,
  },
  finalize: finalizeMock,
  sso: vi.fn(),
  status: 'needs_identifier' as string,
  supportedFirstFactors: [
    { strategy: 'email_code', emailAddressId: 'eid_123' },
  ],
  supportedSecondFactors: [{ strategy: 'email_code' }],
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useSignInSafe: () => ({
    signIn: signInMock,
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

/** Start the email flow so we reach the verification step */
async function setupVerificationStep(result: {
  current: ReturnType<typeof useSignInFlow>;
}) {
  signInMock.status = 'needs_first_factor';
  createMock.mockResolvedValue({ error: null });
  sendFirstFactorCodeMock.mockResolvedValue({ error: null });

  await act(async () => {
    await result.current.startEmailFlow('test@example.com');
  });

  expect(result.current.step).toBe('verification');
}

// --- Tests ---

describe('useSignInFlow – status handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInMock.status = 'needs_identifier';
    signInMock.supportedSecondFactors = [{ strategy: 'email_code' }];
    finalizeMock.mockResolvedValue({ error: null });
  });

  it('handles needs_second_factor with supported factor', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    verifyFirstFactorCodeMock.mockImplementation(async () => {
      signInMock.status = 'needs_second_factor';
      return { error: null };
    });
    sendSecondFactorEmailCodeMock.mockResolvedValue({ error: null });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(sendSecondFactorEmailCodeMock).toHaveBeenCalled();
    expect(result.current.step).toBe('verification');
    expect(result.current.code).toBe('');
    expect(result.current.verificationReason).toBe('mfa');
    expect(result.current.error).toBeNull();
  });

  it('handles needs_second_factor without supported factor', async () => {
    // Override to have no supported second factors
    signInMock.supportedSecondFactors = [];

    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    verifyFirstFactorCodeMock.mockImplementation(async () => {
      signInMock.status = 'needs_second_factor';
      return { error: null };
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(sendSecondFactorEmailCodeMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe(
      'Additional verification is required. Please contact support.'
    );
  });

  it('handles needs_client_trust (string cast) like needs_second_factor', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    verifyFirstFactorCodeMock.mockImplementation(async () => {
      signInMock.status = 'needs_client_trust';
      return { error: null };
    });
    sendSecondFactorEmailCodeMock.mockResolvedValue({ error: null });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(sendSecondFactorEmailCodeMock).toHaveBeenCalled();
    expect(result.current.verificationReason).toBe('device_trust');
    expect(result.current.step).toBe('verification');
  });

  it('calls attemptSecondFactor on second verification after needs_second_factor', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    // First attempt returns needs_second_factor
    verifyFirstFactorCodeMock.mockImplementation(async () => {
      signInMock.status = 'needs_second_factor';
      return { error: null };
    });
    sendSecondFactorEmailCodeMock.mockResolvedValue({ error: null });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    // Second attempt should use attemptSecondFactor
    verifySecondFactorEmailCodeMock.mockImplementation(async () => {
      signInMock.status = 'complete';
      return { error: null };
    });

    await act(async () => {
      await result.current.verifyCode('789012');
    });

    expect(verifySecondFactorEmailCodeMock).toHaveBeenCalledWith({
      code: '789012',
    });
    expect(finalizeMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/app/dashboard');
  });

  it('handles needs_first_factor with error message', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    verifyFirstFactorCodeMock.mockImplementation(async () => {
      signInMock.status = 'needs_first_factor';
      return { error: null };
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(result.current.error).toBe(
      'Verification incomplete. Please try again.'
    );
  });

  it('handles needs_new_password with clear error', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    verifyFirstFactorCodeMock.mockImplementation(async () => {
      signInMock.status = 'needs_new_password';
      return { error: null };
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(result.current.error).toBe(
      'Password setup is not supported. Please sign in with email or Google.'
    );
  });

  it('resets second-factor state on goBack', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    // Trigger second-factor state
    verifyFirstFactorCodeMock.mockImplementation(async () => {
      signInMock.status = 'needs_second_factor';
      return { error: null };
    });
    sendSecondFactorEmailCodeMock.mockResolvedValue({ error: null });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(result.current.verificationReason).toBe('mfa');

    // Go back should reset
    act(() => {
      result.current.goBack();
    });

    expect(result.current.verificationReason).toBe('code');
  });

  describe('with phone_code second factor', () => {
    beforeEach(() => {
      signInMock.supportedSecondFactors = [{ strategy: 'phone_code' }];
    });

    afterEach(() => {
      signInMock.supportedSecondFactors = [{ strategy: 'email_code' }];
    });

    it('uses phone_code strategy when that is the supported second factor', async () => {
      const { result } = renderHook(() => useSignInFlow());
      await setupVerificationStep(result);

      verifyFirstFactorCodeMock.mockImplementation(async () => {
        signInMock.status = 'needs_second_factor';
        return { error: null };
      });
      sendSecondFactorPhoneCodeMock.mockResolvedValue({ error: null });

      await act(async () => {
        await result.current.verifyCode('123456');
      });

      expect(sendSecondFactorPhoneCodeMock).toHaveBeenCalled();

      // Second verification should use phone_code strategy
      verifySecondFactorPhoneCodeMock.mockImplementation(async () => {
        signInMock.status = 'complete';
        return { error: null };
      });

      await act(async () => {
        await result.current.verifyCode('789012');
      });

      expect(verifySecondFactorPhoneCodeMock).toHaveBeenCalledWith({
        code: '789012',
      });
    });
  });

  it('resends second-factor challenge instead of first-factor when in second-factor state', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    // Enter second-factor state
    verifyFirstFactorCodeMock.mockImplementation(async () => {
      signInMock.status = 'needs_second_factor';
      return { error: null };
    });
    sendSecondFactorEmailCodeMock.mockResolvedValue({ error: null });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    // Clear mock to track the resend call
    sendSecondFactorEmailCodeMock.mockClear();
    sendSecondFactorEmailCodeMock.mockResolvedValue({ error: null });

    await act(async () => {
      await result.current.resendCode();
    });

    // Should resend second factor, not first factor
    expect(sendSecondFactorEmailCodeMock).toHaveBeenCalled();
  });
});
