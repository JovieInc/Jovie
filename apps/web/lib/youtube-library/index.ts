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
  COLLABORATOR_AUTO_APPROVE_CONFIDENCE,
  planYouTubeImportArtifacts,
  reconcileVerifiedCollaboratorCredit,
  resolveYouTubeCollaboratorClaims,
  type YouTubeCollaboratorClaim,
} from './collaborators';
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
export {
  deriveThumbnailExperimentWinner,
  promoteThumbnailWinner,
  type ThumbnailExperimentState,
  type ThumbnailPromotion,
} from './thumbnail-experiments';
export {
  deriveThumbnailCandidateReviewIds,
  type RegisterThumbnailCandidateReviewResult,
  registerThumbnailCandidateReview,
} from './thumbnail-review';
export type {
  YouTubeChannelVideo,
  YouTubeLibraryProvider,
  YouTubeMetricWindow,
  YouTubeVideoMetrics,
} from './types';
