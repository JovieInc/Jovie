import { neon } from '@neondatabase/serverless';

export function hasFanCaptureDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && !url.includes('dummy'));
}

function getSql() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes('dummy')) {
    throw new Error(
      'DATABASE_URL is required for fan capture golden-path checks'
    );
  }
  return neon(dbUrl);
}

export async function getCreatorProfileIdByUsername(
  username: string
): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id
    FROM creator_profiles
    WHERE username_normalized = ${username.toLowerCase()}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function cleanupFanCaptureTestData(params: {
  readonly creatorProfileId: string;
  readonly email?: string | null;
  readonly phone?: string | null;
}): Promise<void> {
  const sql = getSql();
  const normalizedEmail = params.email?.trim().toLowerCase() ?? null;
  const normalizedPhone = params.phone?.trim() ?? null;

  if (normalizedEmail) {
    await sql`
      DELETE FROM notification_subscriptions
      WHERE creator_profile_id = ${params.creatorProfileId}
        AND channel = 'email'
        AND lower(email) = ${normalizedEmail}
    `;
    await sql`
      DELETE FROM audience_members
      WHERE creator_profile_id = ${params.creatorProfileId}
        AND lower(email) = ${normalizedEmail}
    `;
  }

  if (normalizedPhone) {
    await sql`
      DELETE FROM notification_subscriptions
      WHERE creator_profile_id = ${params.creatorProfileId}
        AND channel = 'sms'
        AND phone = ${normalizedPhone}
    `;
    await sql`
      DELETE FROM audience_members
      WHERE creator_profile_id = ${params.creatorProfileId}
        AND phone = ${normalizedPhone}
    `;
  }
}

export async function assertEmailCaptureComplete(params: {
  readonly creatorProfileId: string;
  readonly email: string;
}): Promise<void> {
  const sql = getSql();
  const normalizedEmail = params.email.trim().toLowerCase();
  const [subscription] = await sql`
    SELECT confirmed_at
    FROM notification_subscriptions
    WHERE creator_profile_id = ${params.creatorProfileId}
      AND channel = 'email'
      AND lower(email) = ${normalizedEmail}
    LIMIT 1
  `;
  const [audience] = await sql`
    SELECT id
    FROM audience_members
    WHERE creator_profile_id = ${params.creatorProfileId}
      AND lower(email) = ${normalizedEmail}
    LIMIT 1
  `;

  if (!subscription?.confirmed_at) {
    throw new Error(
      `Expected confirmed email subscription for ${normalizedEmail}`
    );
  }
  if (!audience?.id) {
    throw new Error(`Expected audience_members row for ${normalizedEmail}`);
  }
}

export async function assertSmsSubscriptionRow(params: {
  readonly creatorProfileId: string;
  readonly phone: string;
}): Promise<void> {
  const sql = getSql();
  const rows = await sql`
    SELECT id
    FROM notification_subscriptions
    WHERE creator_profile_id = ${params.creatorProfileId}
      AND channel = 'sms'
      AND phone = ${params.phone}
    LIMIT 1
  `;

  if (!rows[0]?.id) {
    throw new Error(`Expected SMS subscription row for ${params.phone}`);
  }
}
