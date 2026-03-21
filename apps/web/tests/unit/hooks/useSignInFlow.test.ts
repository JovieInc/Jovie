import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignInFlow } from '@/hooks/useSignInFlow';

// --- Mocks ---

const pushMock = vi.fn();
const setActiveMock = vi.fn();

const createMock = vi.fn();
const prepareFirstFactorMock = vi.fn();
const attemptFirstFactorMock = vi.fn();
const prepareSecondFactorMock = vi.fn();
const attemptSecondFactorMock = vi.fn();

const signInMock = {
  create: createMock,
  prepareFirstFactor: prepareFirstFactorMock,
  attemptFirstFactor: attemptFirstFactorMock,
  prepareSecondFactor: prepareSecondFactorMock,
  attemptSecondFactor: attemptSecondFactorMock,
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

/** Start the email flow so we reach the verification step */
async function setupVerificationStep(result: {
  current: ReturnType<typeof useSignInFlow>;
}) {
  createMock.mockResolvedValue({
    supportedFirstFactors: [
      { strategy: 'email_code', emailAddressId: 'eid_123' },
    ],
  });
  prepareFirstFactorMock.mockResolvedValue(undefined);

  await act(async () => {
    await result.current.startEmailFlow('test@example.com');
  });

  expect(result.current.step).toBe('verification');
}

// --- Tests ---

describe('useSignInFlow – status handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveMock.mockResolvedValue(undefined);
  });

  it('handles needs_second_factor with supported factor', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_second_factor',
    });
    prepareSecondFactorMock.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(prepareSecondFactorMock).toHaveBeenCalledWith({
      strategy: 'email_code',
    });
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

    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_second_factor',
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(prepareSecondFactorMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe(
      'Additional verification is required. Please contact support.'
    );

    // Restore for other tests
    signInMock.supportedSecondFactors = [{ strategy: 'email_code' }];
  });

  it('handles needs_client_trust (string cast) like needs_second_factor', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_client_trust',
    });
    prepareSecondFactorMock.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(prepareSecondFactorMock).toHaveBeenCalledWith({
      strategy: 'email_code',
    });
    expect(result.current.verificationReason).toBe('device_trust');
    expect(result.current.step).toBe('verification');
  });

  it('calls attemptSecondFactor on second verification after needs_second_factor', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    // First attempt returns needs_second_factor
    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_second_factor',
    });
    prepareSecondFactorMock.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    // Second attempt should use attemptSecondFactor
    attemptSecondFactorMock.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_abc',
    });

    await act(async () => {
      await result.current.verifyCode('789012');
    });

    expect(attemptSecondFactorMock).toHaveBeenCalledWith({
      strategy: 'email_code',
      code: '789012',
    });
    expect(setActiveMock).toHaveBeenCalledWith({ session: 'sess_abc' });
    expect(pushMock).toHaveBeenCalledWith('/app/dashboard');
  });

  it('handles needs_first_factor with error message', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_first_factor',
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

    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_new_password',
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
    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_second_factor',
    });
    prepareSecondFactorMock.mockResolvedValue(undefined);

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

  it('uses phone_code strategy when that is the supported second factor', async () => {
    // Override to only support phone_code as second factor
    signInMock.supportedSecondFactors = [{ strategy: 'phone_code' }];

    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_second_factor',
    });
    prepareSecondFactorMock.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(prepareSecondFactorMock).toHaveBeenCalledWith({
      strategy: 'phone_code',
    });

    // Second verification should use phone_code strategy
    attemptSecondFactorMock.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_phone',
    });

    await act(async () => {
      await result.current.verifyCode('789012');
    });

    expect(attemptSecondFactorMock).toHaveBeenCalledWith({
      strategy: 'phone_code',
      code: '789012',
    });

    // Restore for other tests
    signInMock.supportedSecondFactors = [{ strategy: 'email_code' }];
  });

  it('resends second-factor challenge instead of first-factor when in second-factor state', async () => {
    const { result } = renderHook(() => useSignInFlow());
    await setupVerificationStep(result);

    // Enter second-factor state
    attemptFirstFactorMock.mockResolvedValue({
      status: 'needs_second_factor',
    });
    prepareSecondFactorMock.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    // Clear mock to track the resend call
    prepareSecondFactorMock.mockClear();
    prepareSecondFactorMock.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.resendCode();
    });

    // Should resend second factor, not first factor
    expect(prepareSecondFactorMock).toHaveBeenCalledWith({
      strategy: 'email_code',
    });
  });
});
