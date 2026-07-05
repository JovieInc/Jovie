import { publicEnv } from '@/lib/env-public';

/** Clerk test-mode OTP; reused for fan email capture in local/CI E2E. */
export const FAN_CAPTURE_E2E_OTP_CODE = '424242';

export function isE2EFastOnboardingEnabled(): boolean {
  return (
    process.env.E2E_FAST_ONBOARDING === '1' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1'
  );
}

/** Deterministic fan-capture OTP — never enabled in production deploys. */
export function isDeterministicFanCaptureOtpEnabled(): boolean {
  if (process.env.VERCEL_ENV === 'production') {
    return false;
  }

  return (
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1'
  );
}
