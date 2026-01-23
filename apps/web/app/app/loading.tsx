import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * App root loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function AppLoading() {
  return <AuthLoader />;
}
