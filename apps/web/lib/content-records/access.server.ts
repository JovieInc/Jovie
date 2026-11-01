import 'server-only';
import crypto from 'node:crypto';
import { requireAdmin } from '@/lib/admin/middleware';
import { getCachedAuth } from '@/lib/auth/cached';
import { env } from '@/lib/env-server';

/**
 * Who may write content records: an admin with a fresh session (Tim in Ovie)
 * or an agent holding `CONTENT_PUBLISH_SECRET` (Summer). Agent calls name the
 * acting agent in `x-content-actor`; it is recorded in the audit log as
 * `agent:<name>`. Without the secret configured, only admins can write.
 */

const ACTOR_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export type ContentWriterResult =
  | { readonly ok: true; readonly actor: string }
  | { readonly ok: false; readonly status: 401 | 403; readonly error: string };

export async function resolveContentWriter(
  request: Request
): Promise<ContentWriterResult> {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const secret = env.CONTENT_PUBLISH_SECRET;
    if (!secret || !timingSafeEqualString(authorization.slice(7), secret)) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }
    const actor = request.headers.get('x-content-actor')?.trim() ?? '';
    if (!ACTOR_PATTERN.test(actor)) {
      return {
        ok: false,
        status: 403,
        error: 'x-content-actor must name the acting agent (lowercase slug)',
      };
    }
    return { ok: true, actor: `agent:${actor}` };
  }

  const adminError = await requireAdmin({ session: 'fresh' });
  if (adminError) return { ok: false, status: 401, error: 'Unauthorized' };
  const { userId } = await getCachedAuth({ session: 'fresh' });
  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true, actor: `user:${userId}` };
}

/** Signed preview token for one version: anyone with the link can view it. */
export function signPreviewToken(versionId: string): string | null {
  const secret = env.CONTENT_PUBLISH_SECRET;
  if (!secret) return null;
  return crypto
    .createHmac('sha256', secret)
    .update(`content-preview:${versionId}`)
    .digest('base64url');
}

export function verifyPreviewToken(
  versionId: string,
  token: string | null | undefined
): boolean {
  const expected = signPreviewToken(versionId);
  return Boolean(expected && token && timingSafeEqualString(token, expected));
}
