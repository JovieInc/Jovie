import 'server-only';

import { invalidateAdminCache } from '@/lib/admin/roles';
import { invalidateBanStatusCache } from '@/lib/auth/ban-check';

export async function invalidateProxyUserStateCache(
  userId: string
): Promise<void> {
  await Promise.allSettled([
    invalidateBanStatusCache(userId),
    Promise.resolve(invalidateAdminCache(userId)),
  ]);
}
