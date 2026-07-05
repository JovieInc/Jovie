import {
  getOperatorEnvIssues,
  isOperatorBannerEnvironmentEnabled,
} from '@/lib/admin/operator-banner';
import { OperatorBanner } from './OperatorBanner';

/**
 * Server wrapper for OperatorBanner.
 *
 * Decides on the server whether env issues exist so the client banner can
 * paint on first hydration instead of mounting after a post-hydration fetch.
 */
export async function OperatorBannerWrapper({
  isAdmin,
}: Readonly<{ isAdmin: boolean }>) {
  if (!isAdmin || !isOperatorBannerEnvironmentEnabled()) {
    return null;
  }

  const initialIssues = getOperatorEnvIssues();
  if (initialIssues.length === 0) {
    return null;
  }

  return <OperatorBanner initialIssues={initialIssues} />;
}
