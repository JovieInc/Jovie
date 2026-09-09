import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const PROFILE_CTA_SPEC =
  'tests/e2e/profile/public-profile-cta-identity.spec.ts';
class ProfileCtaPreflightError extends Error {}

type Environment = Record<string, string | undefined>;
type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  is_public: boolean | null;
  has_owner: boolean;
  is_claimed: boolean | null;
};
type Dependencies = {
  seed: () => Promise<{ success: boolean }>;
  profiles: () => Promise<Profile[]>;
  upcomingCount: (profileId: string, now: Date) => Promise<unknown>;
};

export function validateProfileCtaEnvironment(env: Environment) {
  if (
    !env.CI ||
    env.BASE_URL ||
    env.E2E_SKIP_WEB_SERVER === '1' ||
    env.E2E_SKIP_SEED === '1' ||
    env.E2E_WEB_SERVER_COMMAND ||
    !env.DATABASE_URL?.trim()
  ) {
    throw new ProfileCtaPreflightError(
      'profile-cta preflight requires CI, managed local server and database seeding'
    );
  }
}

export function validateProfileCtaConnection(
  env: Environment,
  connection: Record<string, unknown>
) {
  if (
    !env.PROFILE_CTA_NEON_BRANCH_ID ||
    !/^br-[a-z0-9-]+$/.test(env.PROFILE_CTA_NEON_BRANCH_ID) ||
    connection.branch_id !== env.PROFILE_CTA_NEON_BRANCH_ID ||
    connection.db_url !== env.DATABASE_URL ||
    !env.PROFILE_CTA_BROWSER ||
    !['chromium', 'firefox'].includes(env.PROFILE_CTA_BROWSER) ||
    !env.GITHUB_RUN_ID ||
    !/^\d+$/.test(env.GITHUB_RUN_ID) ||
    connection.branch_name !==
      `e2e-full-${env.GITHUB_RUN_ID}-${env.PROFILE_CTA_BROWSER}`
  ) {
    throw new ProfileCtaPreflightError(
      'profile-cta preflight connection does not match the owned workflow branch'
    );
  }
  return {
    branchId: env.PROFILE_CTA_NEON_BRANCH_ID,
    branchName: connection.branch_name,
    parent: 'UNKNOWN',
  };
}

export async function verifyProfileCtaFixtures(
  deps: Dependencies,
  now = new Date()
) {
  // A resolved false result is a failed seed, not evidence that fixtures exist.
  let seeded;
  try {
    seeded = await deps.seed();
  } catch {
    throw new ProfileCtaPreflightError('profile-cta seed failed');
  }
  if (seeded?.success !== true)
    throw new ProfileCtaPreflightError('profile-cta seed did not succeed');
  let profiles;
  try {
    profiles = await deps.profiles();
  } catch {
    throw new ProfileCtaPreflightError('profile-cta profile query failed');
  }
  const expected = [
    ['tim', 'Tim White'],
    ['edgecase-empty', 'Edge Case Empty'],
  ] as const;
  const verified = expected.map(([username, displayName]) => {
    const matches = profiles.filter(profile => profile.username === username);
    const profile = matches[0];
    if (
      matches.length !== 1 ||
      !profile?.id ||
      profile.display_name !== displayName ||
      profile.is_public !== true ||
      (username === 'edgecase-empty' &&
        (profile.has_owner !== true || profile.is_claimed !== true))
    ) {
      throw new ProfileCtaPreflightError(
        `profile-cta required public profile invalid: ${username}`
      );
    }
    return profile;
  });
  const empty = verified[1];
  let count;
  try {
    count = await deps.upcomingCount(empty.id, now);
  } catch {
    throw new ProfileCtaPreflightError(
      'profile-cta upcoming tour query failed'
    );
  }
  if (count !== 0 && count !== '0')
    throw new ProfileCtaPreflightError(
      'profile-cta upcoming confirmed tour count is not zero'
    );
  return {
    profiles: verified.map(({ id, username }) => ({ id, username })),
    upcomingConfirmedTourCount: 0,
    queriedAt: now.toISOString(),
  };
}

export async function runProfileCtaPreflight(
  env: Environment,
  webRoot: string,
  seed: Dependencies['seed']
) {
  const repoRoot = path.resolve(webRoot, '../..');
  const output = path.join(
    webRoot,
    'test-results/profile-cta-fixture-preflight.json'
  );
  let stage = 'environment';
  const proof: Record<string, unknown> = {
    status: 'FAILED',
    spec: PROFILE_CTA_SPEC,
  };
  try {
    validateProfileCtaEnvironment(env);
    stage = 'source';
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    if (!/^[a-f0-9]{40}$/.test(head) || head !== env.GITHUB_SHA)
      throw new Error('source mismatch');
    proof.sourceHead = head;
    proof.sourceFiles = Object.fromEntries(
      [
        '.github/workflows/e2e-full-matrix.yml',
        'apps/web/tests/global-setup.ts',
        'apps/web/playwright.config.ts',
        'apps/web/lib/db/client/connection.ts',
        'apps/web/tests/helpers/profile-cta-fixture-preflight.ts',
        `apps/web/${PROFILE_CTA_SPEC}`,
        'apps/web/tests/seed-test-data.ts',
        'apps/web/lib/tour-dates/queries.ts',
        'apps/web/lib/services/profile/queries.ts',
        'apps/web/lib/tim-white.ts',
      ].map(file => [
        file,
        createHash('sha256')
          .update(readFileSync(path.join(repoRoot, file)))
          .digest('hex'),
      ])
    );
    stage = 'connection';
    const connection = JSON.parse(
      readFileSync(env.PROFILE_CTA_NEON_CONNECTION_FILE ?? '', 'utf8')
    );
    proof.ownedBranch = validateProfileCtaConnection(env, connection);
    stage = 'fixtures';
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(env.DATABASE_URL!);
    const fixture = await verifyProfileCtaFixtures({
      seed,
      profiles: async () => {
        // Same owner join as the public profile loader; no credential values selected.
        const rows =
          await sql`SELECT p.id, p.username, p.display_name, p.is_public, p.is_claimed,
          (u.clerk_id IS NOT NULL) AS has_owner
          FROM creator_profiles p LEFT JOIN users u ON u.id = p.user_id
          WHERE p.username_normalized IN ('tim', 'edgecase-empty')`;
        return rows as Profile[];
      },
      upcomingCount: async (profileId, now) => {
        // Match getUpcomingTourDatesForProfile; errors must never become empty data.
        const rows = await sql`SELECT count(*) AS count FROM tour_dates
          WHERE profile_id = ${profileId} AND start_date >= ${now.toISOString()}
          AND event_type = 'tour' AND confirmation_status = 'confirmed'`;
        return rows.length === 1 ? rows[0].count : undefined;
      },
    });
    Object.assign(proof, fixture, { status: 'PASS' });
  } catch (error) {
    // Never serialize database errors, URLs, credentials, or raw connection metadata.
    proof.failedStage = stage;
    proof.reason =
      error instanceof ProfileCtaPreflightError
        ? error.message
        : 'operation failed';
    throw new Error(
      `profile-cta fixture preflight failed at ${stage}; see sanitized receipt`
    );
  } finally {
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`);
  }
}
