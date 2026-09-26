import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChannelIntelligenceReport } from '@/lib/services/channel-intelligence';
import { ChannelIntelligencePanel } from './ChannelIntelligencePanel';

const REPORT: ChannelIntelligenceReport = {
  channelId: 'channel_1',
  generatedAt: '2026-09-25T00:00:00.000Z',
  windowStart: null,
  windowEnd: null,
  videoCount: 1,
  channelMeanWatchMinutesPerImpression: 0.42,
  bestVideos: [
    {
      videoId: 'video_1',
      title: 'Untitled Video',
      publishedAt: '2026-09-01T00:00:00.000Z',
      watchMinutesPerImpression: 0.5,
      ctrTimesAvgViewDurationMinutes: 0.1,
      ctr: 0.05,
      avgViewDurationSeconds: 90,
      impressions: 1000,
      views: 50,
      watchMinutes: 75,
      reachTrend: 0.1,
      rank: 1,
    },
  ],
  worstVideos: [],
  decliningVideos: [],
  winSignals: [],
  changePlan: [],
  sources: [],
  playlists: [],
  playlistGate: { empty: true, emptyReason: null },
};

describe('ChannelIntelligencePanel', () => {
  it('uses the banned-icon-safe AudioLines glyph for a video with no thumbnail', () => {
    const { container } = render(
      <ChannelIntelligencePanel report={REPORT} isConnected />
    );

    expect(screen.getByText('Untitled Video')).toBeInTheDocument();
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('lucide-audio-lines');
    expect(icon).not.toHaveClass('lucide-disc-3');
  });

  it('shows a connect prompt when analytics are not connected', () => {
    render(<ChannelIntelligencePanel report={null} isConnected={false} />);

    expect(screen.getByText('Connect YouTube Analytics')).toBeInTheDocument();
  });
});
