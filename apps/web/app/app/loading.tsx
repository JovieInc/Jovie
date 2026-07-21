import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';
import { getCachedAuth } from '@/lib/auth/cached';
import { getAppFlagValue } from '@/lib/flags/server';

/**
 * App root loading screen
 * Renders a skeleton of the full app shell (sidebar + header + content)
 * to prevent layout shift while the server layout and data resolve.
 *
 * Variant must match `(shell)/layout.tsx` so DESIGN_V1 users do not flash
 * the legacy sidebar/header geometry before the real shell mounts.
 */
export default async function AppLoading() {
  const auth = await getCachedAuth();
  const shellChatV1 = await getAppFlagValue('DESIGN_V1', {
    userId: auth.userId,
  });

  return <AppShellSkeleton variant={shellChatV1 ? 'shellChatV1' : 'legacy'} />;
}
