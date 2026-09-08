import 'server-only';

import { createHash } from 'node:crypto';
import { env } from '@/lib/env-server';

export type FounderSummerAuthorization =
  | 'authorized'
  | 'forbidden'
  | 'unconfigured';

export function authorizeFounderSummerUser(
  userId: string | null
): FounderSummerAuthorization {
  const founderUserId = env.OVIE_SUMMER_FOUNDER_APP_USER_ID?.trim();
  if (!founderUserId) return 'unconfigured';
  return userId === founderUserId ? 'authorized' : 'forbidden';
}

export function founderPrincipalHash(userId: string): string {
  return createHash('sha256').update(userId).digest('base64url');
}
