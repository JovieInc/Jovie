import { headers } from 'next/headers';
import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';
import {
  APP_SHELL_MODE_HEADER,
  parseTrustedAppShellMode,
} from '@/lib/app-shell/mode';

/**
 * App root loading screen
 * Renders a skeleton of the full app shell (sidebar + header + content)
 * to prevent layout shift while the server layout and data resolve.
 */
export default async function AppLoading() {
  const headerStore = await headers();
  const mode = parseTrustedAppShellMode(headerStore.get(APP_SHELL_MODE_HEADER));

  return <AppShellSkeleton brandVariant={mode === 'ov' ? 'ov' : 'jovie'} />;
}
