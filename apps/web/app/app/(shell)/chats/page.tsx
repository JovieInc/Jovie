import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { ChatsPageClient } from '../threads/ThreadsPageClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  // Bare route name; the root layout template supplies the single brand suffix.
  title: 'Chats',
};

export default async function ChatsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.CHATS,
    dashboardErrorLogMessage: 'Dashboard data load failed on chats page',
    dashboardErrorMessage:
      'Failed to load chats data. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <ChatsPageClient />
    </HydrateClient>
  );
}
