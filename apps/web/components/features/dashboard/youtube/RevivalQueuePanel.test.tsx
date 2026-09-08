import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ExperimentRecord,
  RevivalCandidate,
} from '@/lib/services/youtube-revival/types';
import { RevivalQueuePanel } from './RevivalQueuePanel';

vi.mock(
  '@/components/features/dashboard/youtube/ChannelIntelligencePanel',
  () => ({
    ChannelIntelligencePanel: ({
      isConnected,
    }: {
      readonly isConnected: boolean;
    }) => (
      <div data-testid='channel-intelligence'>
        {isConnected ? 'Connected intelligence' : 'Disconnected intelligence'}
      </div>
    ),
  })
);

const candidate: RevivalCandidate = {
  videoId: 'video-1',
  title: 'A Quiet Revival',
  publishedAt: '2026-01-01T00:00:00.000Z',
  flags: ['ctr_below_median', 'evergreen_declining_reach'],
  opportunityScore: 87,
  challengers: [
    {
      hypothesis: 'Lead with the artist portrait',
      packagingElement: 'face',
      rationale: 'Portrait-led packaging wins in this channel niche.',
    },
  ],
  metrics: {
    impressions: 12_500,
    ctr: 0.032,
    views: 400,
    watchMinPerImpression: 0.41,
    reachTrend: -0.18,
    trafficSource: 'browse_features',
  },
};

const experiment: ExperimentRecord = {
  experimentId: 'experiment-1',
  videoId: candidate.videoId,
  videoTitle: candidate.title,
  status: 'running',
  startedAt: '2026-08-01T00:00:00.000Z',
  baseline: { ctr: 0.032, watchMinPerImpression: 0.41 },
  challenger: { ctr: 0.041, watchMinPerImpression: 0.5 },
  challengerWon: null,
};

describe('RevivalQueuePanel', () => {
  it('uses the canonical page, toolbar, and workspace empty-state contracts when disconnected', () => {
    render(
      <RevivalQueuePanel
        candidates={[]}
        experiments={[]}
        quota={null}
        isConnected={false}
      />
    );

    expect(screen.getByTestId('youtube-revival-queue')).toBeInTheDocument();
    expect(screen.getByTestId('youtube-revival-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('youtube-revival-not-connected')).toHaveClass(
      'py-16',
      'min-h-64'
    );
    expect(
      screen.getByRole('heading', { name: 'Connect Your YouTube Channel' })
    ).toHaveClass('text-2xl', 'text-primary-token');
    expect(screen.getByText('Disconnected intelligence')).toBeInTheDocument();
  });

  it('renders the canonical nested empty state for a connected current queue', () => {
    render(
      <RevivalQueuePanel
        candidates={[]}
        experiments={[]}
        quota={null}
        isConnected
      />
    );

    expect(screen.getByText('0 candidates')).toBeInTheDocument();
    expect(screen.getByTestId('youtube-revival-empty-queue')).toHaveClass(
      'min-h-40'
    );
    expect(
      screen.getByRole('heading', {
        name: 'No underperforming videos found.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText('All videos are meeting channel baselines.')
    ).toBeInTheDocument();
  });

  it('keeps candidate metrics, quota semantics, and experiment state intact', () => {
    render(
      <RevivalQueuePanel
        candidates={[candidate]}
        experiments={[experiment]}
        quota={{
          usedToday: 850,
          dailyCap: 1_000,
          swapsToday: 3,
          maxSwapsPerDay: 5,
        }}
        isConnected
      />
    );

    expect(screen.getByText('1 candidate')).toBeInTheDocument();
    expect(screen.getAllByText(candidate.title)).toHaveLength(2);
    expect(screen.getByText('3.2%')).toBeInTheDocument();
    expect(screen.getByText('-18%')).toBeInTheDocument();
    expect(screen.getByText('12,500')).toBeInTheDocument();
    expect(
      screen.getByText('Lead with the artist portrait')
    ).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '850'
    );
    expect(screen.getByRole('progressbar')).toHaveStyle({ width: '85%' });
  });

  it('renders flat on the shell canvas with page-level scrolling (frame=none contract)', () => {
    render(
      <RevivalQueuePanel
        candidates={[]}
        experiments={[]}
        quota={null}
        isConnected={false}
      />
    );

    const panel = screen.getByTestId('youtube-revival-queue');
    // scroll='page': the panel scrolls with the app shell, never inside itself.
    expect(panel).toHaveClass(
      'overflow-y-auto',
      'overflow-x-hidden',
      'overscroll-contain'
    );
    // frame='none' (JOV-5158): the panel hangs directly on the shell canvas —
    // no nested content-container surface may reappear inside the panel.
    expect(
      panel.querySelector('[class*="bg-(--app-shell-content-surface)"]')
    ).toBeNull();
  });
});
