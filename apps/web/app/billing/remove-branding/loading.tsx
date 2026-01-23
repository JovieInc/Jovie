import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Remove branding billing page loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function RemoveBrandingLoading() {
  return <AuthLoader />;
}
