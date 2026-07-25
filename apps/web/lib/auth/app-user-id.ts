import 'server-only';

import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema/auth';

/**
 * Builds the canonical predicate for an authenticated app user.
 *
 * Better Auth session helpers resolve their external identity to `users.id`
 * before returning. Keeping that contract in one predicate prevents consumers
 * from accidentally comparing the app UUID with the nullable legacy Clerk ID.
 */
export function appUserIdFilter(appUserId: string) {
  return eq(users.id, appUserId);
}
