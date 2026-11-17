import type {
  ChannelIntelligenceReport,
  RankedVideo,
} from '@/lib/services/channel-intelligence';

/** One ranked video for the panel's stories and tests. */
export function rankedVideo(
  rank: number,
  title: string,
  overrides: Partial<RankedVideo> = {}
): RankedVideo {
  return {
    videoId: `video_${rank}`,
    title,
    publishedAt: '2026-09-01T00:00:00.000Z',
    watchMinutesPerImpression: 0.5 - rank * 0.05,
    ctrTimesAvgViewDurationMinutes: 0.1,
    ctr: 0.05,
    avgViewDurationSeconds: 90,
    impressions: 1000,
    views: 50,
    watchMinutes: 75,
    reachTrend: rank % 2 === 0 ? -0.05 : 0.1,
    rank,
    ...overrides,
  };
}

/** A connected channel report with the given ranked and declining videos. */
export function channelReport(
  bestVideos: readonly RankedVideo[],
  decliningVideos: readonly RankedVideo[] = []
): ChannelIntelligenceReport {
  return {
    channelId: 'channel_1',
    generatedAt: '2026-09-25T00:00:00.000Z',
    windowStart: null,
    windowEnd: null,
    videoCount: bestVideos.length + decliningVideos.length,
    channelMeanWatchMinutesPerImpression: 0.42,
    bestVideos,
    worstVideos: [],
    decliningVideos,
    winSignals: [],
    changePlan: [],
    sources: [],
    playlists: [],
    playlistGate: { empty: true, emptyReason: null },
  };
}
