import { publicEnv } from '@/lib/env-public';

export function isE2EFastOnboardingEnabled(): boolean {
  return (
    process.env.E2E_FAST_ONBOARDING === '1' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1'
  );
}
