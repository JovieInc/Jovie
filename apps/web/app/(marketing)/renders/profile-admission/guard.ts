import type { Metadata } from 'next';

export const PROFILE_ADMISSION_FIXTURE_METADATA: Metadata = {
  robots: { index: false, follow: false },
};

/** Keep synthetic profile data unavailable outside the managed E2E runtime. */
export function isProfileAdmissionFixtureEnabled(
  env: Partial<
    Pick<NodeJS.ProcessEnv, 'NEXT_PUBLIC_E2E_MODE' | 'NODE_ENV'>
  > = process.env
): boolean {
  return env.NODE_ENV === 'test' && env.NEXT_PUBLIC_E2E_MODE === '1';
}
