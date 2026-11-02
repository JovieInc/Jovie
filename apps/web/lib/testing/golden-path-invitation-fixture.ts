import { createHash, randomBytes } from 'node:crypto';
import { normalizeEmail } from '@/lib/utils/email';

type InvitationQuery = (
  query: string,
  params: unknown[]
) => Promise<readonly Record<string, unknown>[]>;

/** Issue one invitation in the isolated real-auth lane before its first OTP.
 * The production admission hook and subsequent redemption remain unchanged.
 */
export async function issueGoldenPathInvitation(
  query: InvitationQuery,
  email: string,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<string> {
  const normalized = normalizeEmail(email);
  if (
    environment.E2E_TEST_MODE !== '1' ||
    environment.VERCEL_ENV !== 'development' ||
    !/^gp-(?:[a-z0-9]+)\+e2e@test\.jovie\.com$/.test(normalized)
  ) {
    throw new Error(
      'Golden Path invitation requires its isolated test identity'
    );
  }
  const tokenHash = createHash('sha256').update(randomBytes(32)).digest('hex');
  const [entry] = await query(
    `INSERT INTO waitlist_entries
       (email, email_normalized, canonical, status, source, invite_token_hash,
        invite_token_expires_at)
     VALUES ($1, $1, true, 'invited', 'golden_path_operator_approval', $2, $3)
     RETURNING id`,
    [normalized, tokenHash, new Date(Date.now() + 60 * 60 * 1000)]
  );
  if (typeof entry?.id !== 'string' || !entry.id) {
    throw new Error('Golden Path invitation was not persisted');
  }
  return entry.id;
}
