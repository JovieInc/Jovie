import { ChannelIntelligencePanel } from '@/components/features/dashboard/youtube/ChannelIntelligencePanel';
import { RevivalQueuePanel } from '@/components/features/dashboard/youtube/RevivalQueuePanel';
import { PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { loadAppShellRouteContext } from '../app-shell-route-context';

export const runtime = 'nodejs';

export default async function YouTubeChannelPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.YOUTUBE_REVIVAL,
    dashboardErrorLogMessage:
      'Dashboard data load failed on YouTube channel page',
    dashboardErrorMessage:
      'Failed to load YouTube channel intelligence. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  // YouTube OAuth connector is not yet wired (GH-10912 BlockedBy).
  // Show unconnected empty states until Reporting-API metrics land.
  const toolbar = (
    <PageToolbar
      start={
        <span className='text-xs text-tertiary-token'>
          Ranked by watch minutes per impression
        </span>
      }
      end={null}
    />
  );

  return (
    <PageShell toolbar={toolbar} data-testid='youtube-channel-page'>
      <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden'>
        <div className='flex flex-col gap-8 px-3 py-2.5 sm:px-4 sm:py-3.5'>
          <ChannelIntelligencePanel report={null} isConnected={false} />
          <section aria-labelledby='youtube-revival-section-heading'>
            <h2
              id='youtube-revival-section-heading'
              className='mb-3 text-app font-caption tracking-normal text-secondary-token'
            >
              Revival Queue
            </h2>
            <RevivalQueuePanel
              candidates={[]}
              experiments={[]}
              quota={null}
              isConnected={false}
              withShell={false}
              testId='youtube-revival-queue-section'
            />
          </section>
        </div>
      </div>
    </PageShell>
  );
}
