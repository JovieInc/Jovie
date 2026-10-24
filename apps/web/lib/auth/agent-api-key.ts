import 'server-only';

import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

type AgentAuth =
  | { readonly ok: true; readonly userId: string | null }
  | { readonly ok: false };

/** Absent credentials remain anonymous; invalid credentials never downgrade. */
export async function authenticateAgentApiKey(
  request: Request
): Promise<AgentAuth> {
  const authorization = request.headers.get('authorization');
  if (authorization === null) return { ok: true, userId: null };
  const match = /^Bearer (jovie_[A-Za-z0-9_-]{32,128})$/i.exec(authorization);
  if (!match) return { ok: false };
  const { auth } = await import('./better-auth');
  const result = await auth.api.verifyApiKey({ body: { key: match[1] } });
  if (!result.valid || !result.key) return { ok: false };
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.betterAuthUserId, result.key.referenceId),
        isNull(users.deletedAt),
        notInArray(users.userStatus, ['banned', 'suspended'])
      )
    )
    .limit(1);
  return user ? { ok: true, userId: user.id } : { ok: false };
}
