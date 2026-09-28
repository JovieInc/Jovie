import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ChannelIntelligenceReport } from '@/lib/services/channel-intelligence';
import { ChannelIntelligencePanel } from './ChannelIntelligencePanel';

const REPORT: ChannelIntelligenceReport = {
  channelId: 'channel_1',
  generatedAt: '2026-09-25T00:00:00.000Z',
  windowStart: null,
  windowEnd: null,
  videoCount: 2,
  channelMeanWatchMinutesPerImpression: 0.42,
  bestVideos: [
    {
      videoId: 'video_1',
      title: 'Behind The Scenes: Studio Session',
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
    {
      videoId: 'video_2',
      title: 'Untitled Draft Upload',
      publishedAt: '2026-08-20T00:00:00.000Z',
      watchMinutesPerImpression: 0.31,
      ctrTimesAvgViewDurationMinutes: 0.06,
      ctr: 0.03,
      avgViewDurationSeconds: 40,
      impressions: 500,
      views: 15,
      watchMinutes: 10,
      reachTrend: -0.05,
      rank: 2,
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

const meta = {
  title: 'Dashboard/Youtube/ChannelIntelligencePanel',
  component: ChannelIntelligencePanel,
  args: {
    report: REPORT,
    isConnected: true,
  },
  parameters: {
    // `video` belongs to the private RankedVideoRowProps helper, not to
    // ChannelIntelligencePanel's own props; it is exercised through `report`.
    jovie: {
      uncoveredProps: ['video'],
    },
  },
} satisfies Meta<typeof ChannelIntelligencePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const NotConnected: Story = {
  args: {
    report: null,
    isConnected: false,
  },
};
