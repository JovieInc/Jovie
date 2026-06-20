import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { formatUsd } from '@/lib/admin/format';
import { getDesignPartnerReleaseGmvSnapshot } from '@/lib/release-to-revenue/gmv-attribution';

function formatGmvFromCents(gmvCents: number): string {
  return formatUsd(gmvCents / 100);
}

export async function ReleaseToRevenueGmvPanel() {
  const snapshot = await getDesignPartnerReleaseGmvSnapshot();

  if (!snapshot) {
    return (
      <ContentSurfaceCard
        surface='details'
        className='space-y-2 p-3'
        data-testid='release-to-revenue-gmv-panel'
      >
        <p className='text-app font-medium text-primary-token'>
          Release-to-Revenue GMV
        </p>
        <p className='text-app text-secondary-token'>
          Design partner is not configured in this environment.
        </p>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard
      surface='details'
      className='space-y-3 p-3'
      data-testid='release-to-revenue-gmv-panel'
    >
      <div className='space-y-1'>
        <p className='text-app font-medium text-primary-token'>
          Release-to-Revenue GMV
        </p>
        <p className='text-app text-secondary-token'>
          Store GMV per autopilot release for @{snapshot.creatorUsername}
        </p>
      </div>

      {snapshot.releases.length === 0 ? (
        <p className='text-app text-secondary-token'>
          No release autopilot runs yet.
        </p>
      ) : (
        <div className='space-y-2'>
          {snapshot.releases.map(release => (
            <div
              key={release.workflowRunId}
              data-testid={`release-gmv-row-${release.workflowRunId}`}
            >
              <ContentMetricRow
                label={`${release.releaseTitle} (${release.orderCount.toLocaleString('en-US')} orders)`}
                value={formatGmvFromCents(release.gmvCents)}
              />
            </div>
          ))}
          <div data-testid='release-gmv-total'>
            <ContentMetricRow
              label={`Total GMV (${snapshot.releases.length.toLocaleString('en-US')} releases)`}
              value={formatGmvFromCents(snapshot.totalGmvCents)}
            />
          </div>
        </div>
      )}
    </ContentSurfaceCard>
  );
}
