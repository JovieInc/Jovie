import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';
import { getCachedAuth } from '@/lib/auth/cached';
import { getAppFlagValue } from '@/lib/flags/server';

/**
 * App root loading screen
 * Renders a skeleton of the full app shell (sidebar + header + content)
 * to prevent layout shift while the server layout and data resolve.
 *
 * This is the Suspense fallback Next.js renders while
 * `app/app/(shell)/layout.tsx` is still resolving, so it must resolve the
 * same `DESIGN_V1` variant that layout will land on — otherwise flag-on
 * users flash the legacy skeleton before the shellChatV1 frame mounts.
 * `getCachedAuth()` is request-memoized (React `cache()`), so this doesn't
 * add a second auth round-trip on top of the layout's own call. See #14187.
 */
export default async function AppLoading() {
  const auth = await getCachedAuth();
  const shellChatV1 = await getAppFlagValue('DESIGN_V1', {
    userId: auth.userId,
  });
  return <AppShellSkeleton variant={shellChatV1 ? 'shellChatV1' : 'legacy'} />;
}
