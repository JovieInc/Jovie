import type { Metadata } from 'next';

export const PROFILE_ADMISSION_FIXTURE_METADATA: Metadata = {
  robots: { index: false, follow: false },
};

type ProfileAdmissionFixtureEnv = Partial<
  Pick<
    NodeJS.ProcessEnv,
    'NEXT_PUBLIC_E2E_MODE' | 'NODE_ENV' | 'PUBLIC_NOAUTH_SMOKE'
  >
>;

function readFixtureEnv(
  env: ProfileAdmissionFixtureEnv,
  key: keyof ProfileAdmissionFixtureEnv
) {
  // Index by key so Next cannot compile-time inline a single process.env.*
  // read into a stale NODE_ENV=development literal from `next dev`.
  return env[key];
}

/** Keep synthetic profile data unavailable outside the managed E2E runtime. */
export function isProfileAdmissionFixtureEnabled(
  env: ProfileAdmissionFixtureEnv = process.env
): boolean {
  if (readFixtureEnv(env, 'NEXT_PUBLIC_E2E_MODE') !== '1') {
    return false;
  }

  return (
    readFixtureEnv(env, 'NODE_ENV') === 'test' ||
    readFixtureEnv(env, 'PUBLIC_NOAUTH_SMOKE') === '1'
  );
}
