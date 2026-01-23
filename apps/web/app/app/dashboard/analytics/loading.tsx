import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Analytics dashboard loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function AnalyticsLoading() {
  return <AuthLoader />;
}
