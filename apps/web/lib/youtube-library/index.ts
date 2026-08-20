/**
 * YouTube Library — public barrel (JOV-5136)
 */

export {
  type ClassificationResult,
  type ClassifyInput,
  classifyYouTubeVideo,
  type YouTubeVideoContentType,
} from './classify';
export {
  type CatalogRecording,
  extractIsrcsFromText,
  type ResolvedReleaseLink,
  type ResolveReleaseLinkInput,
  resolveReleaseLink,
} from './isrc';
export {
  type GetVideoMetricsInput,
  getThumbnailHistory,
  getVideoMetricsForProfile,
  getVideoPkForProfile,
  type ListVideosForProfileInput,
  listPendingReleaseLinksForUser,
  listVideosForProfile,
  type PendingReleaseLinkItem,
  type PublicVideoListItem,
  type ThumbnailHistoryItem,
  type VideoMetricSnapshotItem,
} from './queries';
export {
  drizzleYouTubeLibraryRepository,
  insertThumbnailCandidate,
  type StaleChannelRef,
  type YouTubeLibraryRepository,
} from './repository';
export {
  bestThumbnailUrl,
  buildSnapshotRows,
  buildVideoUpsertRow,
  planThumbnailSync,
  type RunScheduledRefreshesInput,
  type RunScheduledRefreshesResult,
  runScheduledRefreshes,
  type SyncChannelVideosInput,
  type SyncChannelVideosResult,
  syncChannelVideos,
  type ThumbnailSyncPlan,
} from './sync';
export type {
  YouTubeChannelVideo,
  YouTubeLibraryProvider,
  YouTubeMetricWindow,
  YouTubeVideoMetrics,
} from './types';
