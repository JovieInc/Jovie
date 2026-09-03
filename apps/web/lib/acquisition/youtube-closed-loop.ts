/**
 * Experiment 2 — YouTube closed loop (JOV-5881) on the JOV-5911 kernel.
 * Thumbs already shipped (JOV-5862). Snippet apply is JOV-5882.
 */

import {
  ACQUISITION_OPTIMIZATION_SURFACES,
  type AcquisitionAttribution,
  type AcquisitionOptimizationContract,
  acquisitionAttribution,
} from './contract';

export const YOUTUBE_CLOSED_LOOP_EXPERIMENT_ID = 'youtube-closed-loop' as const;
export const YOUTUBE_CLOSED_LOOP_VARIANT_ID =
  'youtube-closed-loop:paste-channel:v1' as const;

export const YOUTUBE_CLOSED_LOOP_EVENTS = {
  EXPOSED: 'youtube_thumbnails_paste_exposed',
  PREVIEWED: 'youtube_thumbnails_previewed',
  APPLY_CLICKED: 'youtube_thumbnails_apply_clicked',
  ACTIVATED: 'youtube_closed_loop_activated',
} as const;

export const YOUTUBE_REGULAR_UPLOAD_WINDOW_DAYS = 90;
export const YOUTUBE_REGULAR_UPLOAD_MIN_VIDEOS = 3;
export const YOUTUBE_REGULAR_UPLOAD_MIN_IN_WINDOW = 2;

export const YOUTUBE_CLOSED_LOOP_ICP =
  'Music artists who upload regularly to YouTube' as const;

export const YOUTUBE_CLOSED_LOOP_OPTIMIZATION_CONTRACT: AcquisitionOptimizationContract =
  {
    variantIdentity: YOUTUBE_CLOSED_LOOP_VARIANT_ID,
    exposure: YOUTUBE_CLOSED_LOOP_EVENTS.EXPOSED,
    outcome: YOUTUBE_CLOSED_LOOP_EVENTS.ACTIVATED,
    attribution: {
      surfaces: ACQUISITION_OPTIMIZATION_SURFACES,
      eventProperties: [
        'experimentId',
        'variantIdentity',
        'platform',
        'contentVariant',
        'channelId',
      ],
    },
    eligibleContextDimensions: [
      'platform',
      'medium-or-channel',
      'country-or-locale',
      'content-variant',
    ],
    hypothesis:
      'Regularly-uploading music artists activate faster when paste-first thumbs plus Connect-gated title/description/Jovie-link apply replace a waitlist-first or SKU-first door.',
    primaryMetric:
      'youtube_closed_loop_activated / youtube_thumbnails_paste_exposed on watch_minutes_per_impression for applied videos',
    guardrails: [
      'Paste first; Connect/OAuth only to apply.',
      'No standalone YouTube SKU.',
      'thumbnails.set stays denied; native YouTube experiment required for live thumbs.',
      'videos.update is artist-initiated after Connect; automation cannot apply.',
      'Final DM send remains Tim-only.',
      'Ads stay disarmed until dogfood PASS.',
      'Homepage stays person-first Find me; do not restore waitlist-first on /.',
    ],
    privacyAndConsent:
      'Public channel metadata and thumbnails only until Connect. Visitor keys stay hashed. Channel IDs are public. No search-query persistence. Send is human.',
    optimizerOwner: 'Product',
    cadence:
      'weekly after Tim-channel MCP/CLI dogfood PASS; no outreach before that receipt',
    decisionWriteback:
      'youtube_packaging_experiment plus acquisition run attribution on analytics, audience events, and release-to-revenue',
    rollbackOrControl:
      'Keep YOUTUBE_THUMBNAILS_PASTE_GENERATE=false. Control is paste-preview without apply.',
  };

export function youtubeClosedLoopAttribution(): AcquisitionAttribution {
  return acquisitionAttribution(
    YOUTUBE_CLOSED_LOOP_EXPERIMENT_ID,
    YOUTUBE_CLOSED_LOOP_VARIANT_ID,
    'youtube-thumbnails'
  );
}

export interface YoutubeUploadSignal {
  readonly videoId: string;
  readonly publishedAt: Date | string | null;
}

export function qualifyRegularlyUploadingChannel(input: {
  readonly videos: readonly YoutubeUploadSignal[];
  readonly now?: Date;
}): {
  readonly qualified: boolean;
  readonly publicVideoCount: number;
  readonly uploadsInWindow: number;
  readonly reason: string;
} {
  const now = input.now ?? new Date();
  const cutoff =
    now.getTime() - YOUTUBE_REGULAR_UPLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const uploadsInWindow = input.videos.filter(video => {
    if (!video.publishedAt) return false;
    const published = new Date(video.publishedAt).getTime();
    return Number.isFinite(published) && published >= cutoff;
  }).length;
  const publicVideoCount = input.videos.length;
  const reason =
    publicVideoCount < YOUTUBE_REGULAR_UPLOAD_MIN_VIDEOS
      ? 'need_more_public_videos'
      : uploadsInWindow < YOUTUBE_REGULAR_UPLOAD_MIN_IN_WINDOW
        ? 'not_regularly_uploading'
        : 'regularly_uploading_music_channel';
  return {
    qualified: reason === 'regularly_uploading_music_channel',
    publicVideoCount,
    uploadsInWindow,
    reason,
  };
}
