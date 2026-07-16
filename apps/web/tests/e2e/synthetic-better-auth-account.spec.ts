import { writeFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';
import {
  assertDeploymentStable,
  assertRuntimeMatchesDeployment,
  buildBetterAuthAccountCanaryEmail,
  buildBetterAuthAccountCanaryLikePattern,
  buildBetterAuthAccountCanaryReceipt,
  buildBetterAuthSignInVerificationIdentifier,
  getReadyProductionDeployment,
  isExactBetterAuthAccountCanaryEmail,
  validateBetterAuthAccountCanaryConfig,
} from './utils/better-auth-account-canary';
import { waitForProductionSignupOtp } from './utils/production-signup-canary';

test.use({ storageState: { cookies: [], origins: [] } });

interface IdentityLinkageRow {
  readonly better_auth_user_id: string;
  readonly app_user_id: string;
  readonly session_count: string;
}

interface ResidueRow {
  readonly ba_users: string;
  readonly app_users: string;
  readonly sessions: string;
  readonly accounts: string;
  readonly verifications: string;
}

interface CleanupResultRow {
  readonly authorized: boolean;
}

interface StaleCanaryOwnership {
  readonly baUserId: string;
  readonly createdAt: Date;
  readonly cutoff: Date;
}

const STALE_CANARY_MIN_AGE_MINUTES = 60;
const MAX_STALE_CANARIES_PER_RUN = 5;
let activeCanaryEmail: string | null = null;

function productionSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return neon(databaseUrl);
}

async function readResidue(email: string): Promise<ResidueRow> {
  const sql = productionSql();
  const verificationIdentifier =
    buildBetterAuthSignInVerificationIdentifier(email);
  const rows = await sql`
    SELECT
      (SELECT count(*) FROM ba_users WHERE email = ${email})::text AS ba_users,
      (SELECT count(*) FROM users WHERE email = ${email})::text AS app_users,
      (SELECT count(*) FROM ba_sessions WHERE user_id IN
        (SELECT id FROM ba_users WHERE email = ${email}))::text AS sessions,
      (SELECT count(*) FROM ba_accounts WHERE user_id IN
        (SELECT id FROM ba_users WHERE email = ${email}))::text AS accounts,
      (SELECT count(*) FROM ba_verifications WHERE identifier = ${verificationIdentifier})::text AS verifications
  `;
  const row = rows[0] as ResidueRow | undefined;
  if (!row) throw new Error('Canary residue query returned no row');
  return row;
}

function assertZeroResidue(residue: ResidueRow): void {
  for (const [table, count] of Object.entries(residue)) {
    if (count !== '0') {
      throw new Error(`Better Auth canary cleanup left residue in ${table}`);
    }
  }
}

async function cleanupExactCanaryIdentity(
  email: string,
  staleOwnership?: StaleCanaryOwnership
): Promise<void> {
  const baseEmail = process.env.E2E_PROD_SIGNUP_EMAIL_BASE ?? '';
  if (!isExactBetterAuthAccountCanaryEmail(email, baseEmail)) {
    throw new Error(
      'Refusing cleanup outside the exact Better Auth canary namespace'
    );
  }

  const sql = productionSql();
  const verificationIdentifier =
    buildBetterAuthSignInVerificationIdentifier(email);
  const [cleanupRows] = await sql.transaction(
    [
      sql`
        WITH
        target_ba AS MATERIALIZED (
          SELECT id, created_at FROM ba_users WHERE email = ${email} FOR UPDATE
        ),
        target_email_apps AS MATERIALIZED (
          SELECT id, better_auth_user_id, clerk_id
          FROM users
          WHERE email = ${email}
          FOR UPDATE
        ),
        target_link_apps AS MATERIALIZED (
          SELECT u.id, u.email
          FROM users u
          INNER JOIN target_ba target ON target.id = u.better_auth_user_id
          FOR UPDATE OF u
        ),
        target_profiles AS MATERIALIZED (
          SELECT cp.id
          FROM creator_profiles cp
          INNER JOIN target_email_apps target ON target.id = cp.user_id
          FOR UPDATE OF cp
        ),
        cleanup_guard AS MATERIALIZED (
          SELECT true AS authorized
          WHERE (SELECT count(*) FROM target_ba) <= 1
            AND (SELECT count(*) FROM target_email_apps) <= 1
            AND NOT EXISTS (
              SELECT 1 FROM target_link_apps WHERE email IS DISTINCT FROM ${email}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM target_email_apps app
              WHERE app.better_auth_user_id IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM target_ba WHERE target_ba.id = app.better_auth_user_id
                )
            )
            AND NOT EXISTS (
              SELECT 1 FROM target_email_apps WHERE clerk_id IS NOT NULL
            )
            AND NOT EXISTS (SELECT 1 FROM target_profiles)
            AND (
              ${staleOwnership?.baUserId ?? null}::text IS NULL OR (
                (SELECT count(*) FROM target_ba) = 1
                AND EXISTS (
                  SELECT 1
                  FROM target_ba
                  WHERE id = ${staleOwnership?.baUserId ?? null}::text
                    AND created_at = ${staleOwnership?.createdAt ?? null}::timestamptz
                    AND created_at < ${staleOwnership?.cutoff ?? null}::timestamptz
                )
              )
            )
        ),
        deleted_app AS (
          DELETE FROM users
          USING cleanup_guard
          WHERE users.email = ${email}
          RETURNING users.id
        ),
        deleted_verification AS (
          DELETE FROM ba_verifications
          USING cleanup_guard
          WHERE ba_verifications.identifier = ${verificationIdentifier}
          RETURNING ba_verifications.id
        ),
        deleted_ba AS (
          DELETE FROM ba_users
          USING cleanup_guard
          WHERE ba_users.email = ${email}
          RETURNING ba_users.id
        )
        SELECT
          EXISTS (SELECT 1 FROM cleanup_guard) AS authorized,
          (SELECT count(*) FROM deleted_app) AS deleted_app_count,
          (SELECT count(*) FROM deleted_verification) AS deleted_verification_count,
          (SELECT count(*) FROM deleted_ba) AS deleted_ba_count
      `,
    ],
    { isolationLevel: 'Serializable' }
  );
  const cleanupResult = cleanupRows[0] as CleanupResultRow | undefined;
  if (!cleanupResult?.authorized) {
    throw new Error('Transactional canary cleanup ownership guard rejected');
  }
  assertZeroResidue(await readResidue(email));
}

async function reconcileStaleCanaryIdentities(): Promise<void> {
  const baseEmail = process.env.E2E_PROD_SIGNUP_EMAIL_BASE!;
  const likePattern = buildBetterAuthAccountCanaryLikePattern(baseEmail);
  const cutoff = new Date(
    Date.now() - STALE_CANARY_MIN_AGE_MINUTES * 60 * 1000
  );
  const sql = productionSql();
  const staleRows = await sql`
    SELECT bu.id, bu.email, bu.created_at
    FROM ba_users bu
    LEFT JOIN users u ON u.better_auth_user_id = bu.id
    WHERE bu.email LIKE ${likePattern} ESCAPE E'\\\\'
      AND bu.created_at < ${cutoff}
      AND (
        u.id IS NULL OR (
          u.clerk_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM creator_profiles cp WHERE cp.user_id = u.id
          )
        )
      )
    ORDER BY bu.created_at ASC
    LIMIT ${MAX_STALE_CANARIES_PER_RUN}
  `;

  for (const row of staleRows as ReadonlyArray<{
    readonly id: string;
    readonly email: string;
    readonly created_at: Date;
  }>) {
    if (!isExactBetterAuthAccountCanaryEmail(row.email, baseEmail)) {
      throw new Error(
        'Stale canary query returned an address outside its namespace'
      );
    }
    await cleanupExactCanaryIdentity(row.email, {
      baUserId: row.id,
      createdAt: row.created_at,
      cutoff,
    });
  }
}

async function readIdentityLinkage(email: string): Promise<IdentityLinkageRow> {
  const sql = productionSql();
  const rows = await sql`
    SELECT
      bu.id AS better_auth_user_id,
      u.id AS app_user_id,
      count(bs.id)::text AS session_count
    FROM ba_users bu
    INNER JOIN users u ON u.better_auth_user_id = bu.id AND u.email = bu.email
    LEFT JOIN ba_sessions bs ON bs.user_id = bu.id
    WHERE bu.email = ${email}
    GROUP BY bu.id, u.id
  `;
  if (rows.length !== 1) {
    throw new Error('Expected exactly one linked ba_users/users identity');
  }
  return rows[0] as IdentityLinkageRow;
}

test.describe('Synthetic Monitoring - Better Auth production account', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SYNTHETIC_MODE !== 'true' ||
        process.env.E2E_PROD_ACCOUNT_CANARY_ENABLED !== 'true',
      'Production account canary requires both explicit synthetic gates.'
    );
  });

  test.afterEach(async ({}, testInfo) => {
    if (!activeCanaryEmail) return;
    testInfo.setTimeout(60_000);
    const email = activeCanaryEmail;
    await cleanupExactCanaryIdentity(email);
    activeCanaryEmail = null;
  });

  test('creates a real OTP session, proves linkage, and leaves zero residue', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    validateBetterAuthAccountCanaryConfig(process.env);

    const runId = process.env.SYNTHETIC_RUN_ID!;
    const email = buildBetterAuthAccountCanaryEmail(
      process.env.E2E_PROD_SIGNUP_EMAIL_BASE!,
      runId
    );
    activeCanaryEmail = email;
    const startedAt = new Date();
    const deploymentBefore = await getReadyProductionDeployment(process.env);
    await assertRuntimeMatchesDeployment(deploymentBefore);
    await reconcileStaleCanaryIdentities();
    let testError: unknown;

    try {
      await cleanupExactCanaryIdentity(email);
      await page.goto('/signup', { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Email Address').fill(email);
      await page.getByRole('button', { name: 'Continue with Email' }).click();
      await expect(
        page.locator('[data-auth-email-code-step="code"]')
      ).toBeVisible({ timeout: 30_000 });

      const otp = await waitForProductionSignupOtp({
        email,
        env: process.env,
        startedAtMs: startedAt.getTime(),
      });
      await page.getByLabel('Digit 1 of 6').pressSequentially(otp);
      await page.waitForURL(/\/start(?:[/?#]|$)/, { timeout: 45_000 });

      const session = await page.evaluate(async () => {
        const response = await fetch('/api/auth/get-session');
        if (!response.ok) return null;
        return (await response.json()) as { user?: { id?: string } };
      });
      expect(session?.user?.id).toBeTruthy();

      const linkage = await readIdentityLinkage(email);
      expect(linkage.better_auth_user_id).toBe(session?.user?.id);
      expect(Number(linkage.session_count)).toBeGreaterThan(0);
    } catch (error) {
      testError = error;
    }

    try {
      await cleanupExactCanaryIdentity(email);
      activeCanaryEmail = null;
    } catch (cleanupError) {
      testError = testError
        ? new AggregateError(
            [testError, cleanupError],
            'Canary and cleanup failed'
          )
        : cleanupError;
    }
    if (testError) throw testError;

    const deploymentAfter = await getReadyProductionDeployment(process.env);
    assertDeploymentStable(deploymentBefore, deploymentAfter);
    await assertRuntimeMatchesDeployment(deploymentAfter);

    const receipt = buildBetterAuthAccountCanaryReceipt({
      runId,
      email,
      deployment: deploymentAfter,
      startedAt,
      completedAt: new Date(),
    });
    const receiptPath = testInfo.outputPath(
      'better-auth-account-canary-receipt.json'
    );
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await testInfo.attach('better-auth-account-canary-receipt', {
      path: receiptPath,
      contentType: 'application/json',
    });
  });
});
