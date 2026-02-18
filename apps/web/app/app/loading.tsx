import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';

/**
 * App root loading screen
 * Renders a skeleton of the full app shell (sidebar + header + content)
 * to prevent layout shift while the server layout and data resolve.
 */
export default function AppLoading() {
  return <AppShellSkeleton />;
}
