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
  // Bracket access so Next cannot compile-time inline a NEXT_PUBLIC_* /
  // NODE_ENV literal from `next dev` into a stale false.
  return env[key];
}

function runtimeFixtureEnv(): ProfileAdmissionFixtureEnv {
  const env = process.env;
  return {
    NEXT_PUBLIC_E2E_MODE: env['NEXT_PUBLIC_E2E_MODE'],
    NODE_ENV: env['NODE_ENV'],
    PUBLIC_NOAUTH_SMOKE: env['PUBLIC_NOAUTH_SMOKE'],
  };
}

/** Keep synthetic profile data unavailable outside the managed E2E runtime. */
export function isProfileAdmissionFixtureEnabled(
  env: ProfileAdmissionFixtureEnv = runtimeFixtureEnv()
): boolean {
  // Never serve the fixture from a production build.
  if (readFixtureEnv(env, 'NODE_ENV') === 'production') {
    return false;
  }

  return (
    readFixtureEnv(env, 'NEXT_PUBLIC_E2E_MODE') === '1' ||
    readFixtureEnv(env, 'PUBLIC_NOAUTH_SMOKE') === '1'
  );
}
