import { YouTubeChannelPilotPanel } from '@/components/features/dashboard/youtube/YouTubeChannelPilotPanel';
import { APP_ROUTES } from '@/constants/routes';
import { loadAuthorizedYouTubeChannelWorkspace } from '@/lib/youtube-library';
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

  const workspace = routeContext.profileId
    ? await loadAuthorizedYouTubeChannelWorkspace({
        userId: routeContext.userId,
        creatorProfileId: routeContext.profileId,
      })
    : ({
        state: 'auth-required',
        videos: [],
        errorMessage:
          'Select an owned creator profile before connecting YouTube.',
      } as const);

  return <YouTubeChannelPilotPanel workspace={workspace} />;
}
