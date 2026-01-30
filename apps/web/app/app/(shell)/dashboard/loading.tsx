import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Dashboard loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function DashboardLoading() {
  return <AuthLoader />;
}
