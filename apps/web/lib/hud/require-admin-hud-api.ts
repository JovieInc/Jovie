import 'server-only';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
/** Read-only Ovie observation uses baseline role + optional privacy, not a mandatory MFA curtain. */
export async function requireAdminHudApiAccess(options?: {
  session?: 'cookie' | 'fresh';
  privileged?: boolean;
}) {
  return requireOvieApiAccess({
    privileged: options?.privileged ?? false,
  });
}
