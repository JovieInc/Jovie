import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Dashboard overview loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function OverviewLoading() {
  return <AuthLoader />;
}
