import { RevivalQueuePanel } from '@/components/features/dashboard/youtube/RevivalQueuePanel';
import { APP_ROUTES } from '@/constants/routes';
import { loadAppShellRouteContext } from '../app-shell-route-context';

export const runtime = 'nodejs';

export default async function YouTubeRevivalQueuePage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.YOUTUBE_REVIVAL,
    dashboardErrorLogMessage:
      'Dashboard data load failed on YouTube revival queue page',
    dashboardErrorMessage:
      'Failed to load the revival queue. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  // ponytail: connector and experiment engine are not yet wired (GH-10921 BlockedBy).
  // Show the unconnected empty state until the YouTube OAuth connector lands.
  return (
    <RevivalQueuePanel
      candidates={[]}
      experiments={[]}
      quota={null}
      isConnected={false}
    />
  );
}
