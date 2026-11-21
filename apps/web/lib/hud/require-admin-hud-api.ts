import 'server-only';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
/** Read observation: role + privacy. Privileged HUD: MFA via hasRecentAdminMfaReverification. */
export async function requireAdminHudApiAccess(options?: {
  session?: 'cookie' | 'fresh';
  privileged?: boolean;
}) {
  return requireOvieApiAccess({
    privileged: options?.privileged ?? false,
  });
}
