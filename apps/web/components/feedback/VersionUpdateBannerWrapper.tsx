import { VersionUpdateToastActivator } from './VersionUpdateToastActivator';

/**
 * Server wrapper for the client-only version update toast activator.
 *
 * Keeping a stable wrapper module prevents React Client Manifest lookup errors
 * when server components reference this boundary across deploys.
 */
export function VersionUpdateBannerWrapper() {
  return <VersionUpdateToastActivator />;
}
