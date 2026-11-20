import 'server-only';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';

/**
 * HUD API gate. Read-only observation stays role + privacy (no MFA curtain).
 * Mutations and secret material must pass `privileged: true` so
 * `hasRecentAdminMfaReverification` matches `requireAdmin()` / entitlements.
 */
export async function requireAdminHudApiAccess(options?: {
  session?: 'cookie' | 'fresh';
  privileged?: boolean;
}) {
  return requireOvieApiAccess({
    privileged: options?.privileged ?? false,
  });
}
