import {
  getImpersonationState,
  isImpersonationEnabled,
} from '@/lib/admin/impersonation';
import { ImpersonationBanner } from './ImpersonationBanner';

/**
 * Server component wrapper for ImpersonationBanner.
 *
 * This wrapper:
 * 1. Checks if impersonation is enabled in the environment
 * 2. Checks if there's an active impersonation session
 * 3. Only renders the client banner if impersonation is active
 *
 * This prevents unnecessary client-side JS when not impersonating.
 */
export async function ImpersonationBannerWrapper() {
  // Skip entirely if impersonation is disabled
  if (!isImpersonationEnabled()) {
    return null;
  }

  // Check for active impersonation
  const state = await getImpersonationState();
  if (!state) {
    return null;
  }

  // Render the client component when impersonating
  return <ImpersonationBanner />;
}
