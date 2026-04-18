/**
 * Types for Spotify Canvas generation and track-level Canvas state.
 */

export interface CanvasVideoSpec {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly aspectRatio: string;
  readonly minDurationSec: number;
  readonly maxDurationSec: number;
  readonly maxFileSizeBytes: number;
  readonly codecs: readonly string[];
  readonly formats: readonly string[];
  readonly fps: number;
}

export type CanvasStatus = 'not_set' | 'processing' | 'generated' | 'uploaded';

export type TrackCanvasStatus =
  | 'not_set'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'uploaded'
  | 'failed';

export type CanvasGenerationStage =
  | 'queued'
  | 'preparing_image'
  | 'repairing_image'
  | 'generating_video'
  | 'encoding'
  | 'validating'
  | 'completed'
  | 'failed';

export type CanvasArtifactKind =
  | 'image_master'
  | 'upload_video'
  | 'master_video'
  | 'poster'
  | 'manifest'
  | 'debug_preview';

export type CanvasMotionPreset =
  | 'ambient'
  | 'zoom'
  | 'pan'
  | 'particles'
  | 'morph';

export interface CanvasStyle {
  readonly motionType?: CanvasMotionPreset;
  readonly colorMood?: string;
  readonly removeText?: boolean;
  readonly upscale?: boolean;
}

export interface CanvasGenerationInput {
  readonly releaseId: string;
  readonly trackId: string;
  readonly releaseTrackId?: string;
  readonly artworkUrl: string;
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly motionPreset?: CanvasMotionPreset;
  readonly style?: CanvasStyle;
}

export interface CanvasArtifactRecord {
  readonly id: string;
  readonly generationId: string;
  readonly kind: CanvasArtifactKind;
  readonly storagePath: string;
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationSec: number | null;
  readonly fileSizeBytes: number | null;
  readonly createdAt: string;
}

export interface CanvasGenerationRecord {
  readonly id: string;
  readonly releaseId: string;
  readonly trackId: string;
  readonly releaseTrackId?: string;
  readonly imageMasterId?: string | null;
  readonly status: TrackCanvasStatus;
  readonly stage: CanvasGenerationStage;
  readonly motionPreset: CanvasMotionPreset;
  readonly provider: string;
  readonly model: string;
  readonly durationSec: number;
  readonly loopStrategy: string;
  readonly failureCode?: string | null;
  readonly failureMessage?: string | null;
  readonly qc: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly artifacts?: readonly CanvasArtifactRecord[];
}

export interface TrackCanvasSummary {
  readonly status: TrackCanvasStatus;
  readonly currentGenerationId?: string;
  readonly hasDownloadableAsset: boolean;
  readonly versionCount: number;
  readonly lastGeneratedAt?: string;
  readonly lastError?: string;
}

export interface TrackCanvasHistory {
  readonly trackId: string;
  readonly releaseTrackId?: string;
  readonly status: TrackCanvasStatus;
  readonly currentGenerationId?: string;
  readonly uploadedGenerationId?: string;
  readonly lastGeneratedAt?: string;
  readonly lastError?: string;
  readonly generations: readonly CanvasGenerationRecord[];
}

export interface CanvasGenerationResult {
  readonly success: boolean;
  readonly generationId: string;
  readonly status: TrackCanvasStatus;
  readonly stage: CanvasGenerationStage;
  readonly artifact?: CanvasArtifactRecord;
  readonly error?: string;
}

export interface CanvasGenerationJob {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly releaseId: string;
  readonly trackId: string;
  readonly releaseTrackId?: string;
  readonly status: TrackCanvasStatus;
  readonly stage: CanvasGenerationStage;
  readonly input: CanvasGenerationInput;
  readonly result?: CanvasGenerationResult;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type SocialAdPlatform =
  | 'tiktok'
  | 'instagram_reels'
  | 'instagram_story'
  | 'youtube_shorts'
  | 'hulu'
  | 'generic';

export interface SocialAdGenerationInput {
  readonly releaseId: string;
  readonly platform: SocialAdPlatform;
  readonly clipDurationSec: number;
  readonly autoSelectClip: boolean;
  readonly artworkUrl: string;
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly jovieUrl: string;
  readonly promoText?: string;
}

export interface SocialAdGenerationResult {
  readonly success: boolean;
  readonly videoUrl?: string;
  readonly promoText?: string;
  readonly qrCodeUrl?: string;
  readonly error?: string;
}

export interface TikTokPreviewClip {
  readonly startSec: number;
  readonly endSec: number;
  readonly reason: string;
  readonly confidence: number;
  readonly features: readonly string[];
}

export interface RelatedArtistSuggestion {
  readonly name: string;
  readonly spotifyId?: string;
  readonly reason: string;
  readonly similarity: number;
  readonly useCases: readonly (
    | 'playlist_pitching'
    | 'ad_targeting'
    | 'collaboration'
    | 'tour_support'
  )[];
}
