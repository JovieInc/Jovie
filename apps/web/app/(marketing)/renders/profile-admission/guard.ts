import type { Metadata } from 'next';

export const PROFILE_ADMISSION_FIXTURE_METADATA: Metadata = {
  robots: { index: false, follow: false },
};

type ProfileAdmissionFixtureEnv = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'CI'
    | 'NEXT_PUBLIC_E2E_MODE'
    | 'NODE_ENV'
    | 'PUBLIC_NOAUTH_SMOKE'
    | 'VERCEL_ENV'
  >
>;

function readFixtureEnv(
  env: ProfileAdmissionFixtureEnv,
  key: keyof ProfileAdmissionFixtureEnv
) {
  // Read the supplied environment snapshot. Next may still inline literals in
  // compiled defaults; source access syntax is not an inlining guarantee.
  return env[key];
}

function runtimeFixtureEnv(): ProfileAdmissionFixtureEnv {
  const env = process.env;
  return {
    CI: env['CI'],
    NEXT_PUBLIC_E2E_MODE: env['NEXT_PUBLIC_E2E_MODE'],
    NODE_ENV: env['NODE_ENV'],
    PUBLIC_NOAUTH_SMOKE: env['PUBLIC_NOAUTH_SMOKE'],
    VERCEL_ENV: env['VERCEL_ENV'],
  };
}

/** Keep synthetic profile data unavailable outside the managed E2E runtime. */
export function isProfileAdmissionFixtureEnabled(
  env: ProfileAdmissionFixtureEnv = runtimeFixtureEnv()
): boolean {
  // Diagnostic-only: classify the actual server snapshot, never raw env values.
  // Logging failures must not change fixture admission or production denial.
  const finish = (allowed: boolean, reason: string): boolean => {
    try {
      const diagnosticEnv = process.env;
      if (
        readFixtureEnv(env, 'CI') === 'true' &&
        diagnosticEnv['PROFILE_ADMISSION_DIAGNOSTICS'] === '1'
      ) {
        const nodeEnv = readFixtureEnv(env, 'NODE_ENV');
        const vercelEnv = readFixtureEnv(env, 'VERCEL_ENV');
        console.info(
          '[profile-admission-guard] ' +
            JSON.stringify({
              schemaVersion: 1,
              invoked: true,
              allowed,
              reason,
              ci: readFixtureEnv(env, 'CI') === 'true',
              e2e: readFixtureEnv(env, 'NEXT_PUBLIC_E2E_MODE') === '1',
              smoke: readFixtureEnv(env, 'PUBLIC_NOAUTH_SMOKE') === '1',
              nodeMode:
                nodeEnv === 'production' ||
                nodeEnv === 'development' ||
                nodeEnv === 'test'
                  ? nodeEnv
                  : 'other-or-unset',
              deploymentMode:
                vercelEnv === 'production' ||
                vercelEnv === 'preview' ||
                vercelEnv === 'development'
                  ? vercelEnv
                  : 'other-or-unset',
            })
        );
      }
    } catch {
      // Observability is best-effort; preserve the original return value.
    }
    return allowed;
  };

  // Never serve the fixture from the production deployment runtime.
  if (readFixtureEnv(env, 'VERCEL_ENV') === 'production') {
    return finish(false, 'production-deployment');
  }

  if (
    readFixtureEnv(env, 'NODE_ENV') === 'production' &&
    readFixtureEnv(env, 'CI') !== 'true'
  ) {
    return finish(false, 'production-process-without-ci');
  }

  const allowed =
    readFixtureEnv(env, 'NEXT_PUBLIC_E2E_MODE') === '1' ||
    readFixtureEnv(env, 'PUBLIC_NOAUTH_SMOKE') === '1';
  return finish(
    allowed,
    allowed ? 'fixture-enabled' : 'fixture-flags-disabled'
  );
}
