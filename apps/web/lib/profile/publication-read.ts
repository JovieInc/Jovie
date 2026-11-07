import { neon } from '@neondatabase/serverless';
import { isPublicProfilePublished } from './public-profile-access';

/**
 * One fresh storage read of a handle's publication (JOV-8629 §6.2), shaped for
 * the proxy hot path: a single Neon HTTP query with a hard timeout, no Drizzle,
 * no pool and no function hop. Throws on storage failure or timeout so callers
 * fail closed.
 */
export const PUBLICATION_READ_TIMEOUT_MS = 1_500;

export async function readProfilePublished(
  username: string,
  {
    databaseUrl = process.env.DATABASE_URL,
    timeoutMs = PUBLICATION_READ_TIMEOUT_MS,
  }: { databaseUrl?: string; timeoutMs?: number } = {}
): Promise<boolean> {
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  const sql = neon(databaseUrl, {
    fetchOptions: { signal: AbortSignal.timeout(timeoutMs) },
  });
  const rows = (await sql.query(
    'select is_public from creator_profiles where username_normalized = $1 limit 1',
    [username]
  )) as Array<{ is_public: unknown }>;
  return rows.length > 0 && isPublicProfilePublished(rows[0]?.is_public);
}
