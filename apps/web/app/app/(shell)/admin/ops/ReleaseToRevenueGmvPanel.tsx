import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { formatUsd } from '@/lib/admin/format';
import { getAllTenantsReleaseGmvSnapshot } from '@/lib/release-to-revenue/gmv-attribution';

function formatGmvFromCents(gmvCents: number): string {
  return formatUsd(gmvCents / 100);
}

export async function ReleaseToRevenueGmvPanel() {
  const snapshot = await getAllTenantsReleaseGmvSnapshot();
  const creatorLabel = snapshot.tenantCount === 1 ? 'creator' : 'creators';

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
          Store GMV per autopilot release across{' '}
          {snapshot.tenantCount.toLocaleString('en-US')} {creatorLabel}
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
                label={`${release.creatorUsername ? `@${release.creatorUsername}` : 'Unknown creator'} · ${release.releaseTitle} (${release.orderCount.toLocaleString('en-US')} orders)`}
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
