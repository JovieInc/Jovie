import { hasRecentAdminMfaReverification } from '@/lib/admin/mfa';
import { getCachedAuth } from '@/lib/auth/cached';
import { AdminStepUpBanner } from './AdminStepUpBanner';

/**
 * Server-decided so the bar paints on first render (no layout shift).
 * Shown only to admin-role users whose session lacks a live passkey
 * step-up; without it every admin API answers 403 (JOV-4806).
 */
export async function AdminStepUpBannerWrapper({
  isAdmin,
}: Readonly<{ isAdmin: boolean }>) {
  if (!isAdmin) return null;
  if (await hasRecentAdminMfaReverification(await getCachedAuth())) {
    return null;
  }
  return <AdminStepUpBanner />;
}
