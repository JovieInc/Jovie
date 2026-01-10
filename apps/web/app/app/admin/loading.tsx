import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Admin loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function AdminLoading() {
  return <AuthLoader />;
}
