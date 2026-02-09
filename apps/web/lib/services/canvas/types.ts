/**
 * Types for Spotify Canvas and media generation features.
 *
 * Spotify Canvas is a short looping video (3-8 seconds) that plays behind
 * a track in the Spotify mobile app. Artists upload these via Spotify for Artists.
 *
 * This module defines the types for:
 * - Canvas video specifications (format, dimensions, duration)
 * - Canvas generation jobs (tracking async AI video generation)
 * - Canvas status per release (stored in release metadata JSONB)
 */

// ---------------------------------------------------------------------------
// Spotify Canvas Video Specifications
// ---------------------------------------------------------------------------

/** Spotify Canvas video format requirements */
export interface CanvasVideoSpec {
  /** Minimum width in pixels */
  readonly minWidth: number;
  /** Minimum height in pixels */
  readonly minHeight: number;
  /** Required aspect ratio (width:height) */
  readonly aspectRatio: string;
  /** Minimum duration in seconds */
  readonly minDurationSec: number;
  /** Maximum duration in seconds */
  readonly maxDurationSec: number;
  /** Maximum file size in bytes */
  readonly maxFileSizeBytes: number;
  /** Supported video codecs */
  readonly codecs: readonly string[];
  /** Supported container formats */
  readonly formats: readonly string[];
  /** Required frame rate (fps) */
  readonly fps: number;
}

// ---------------------------------------------------------------------------
// Canvas Generation
// ---------------------------------------------------------------------------

/** Status of a canvas generation job */
export type CanvasGenerationStatus =
  | 'pending'
  | 'processing_artwork'
  | 'generating_video'
  | 'encoding'
  | 'completed'
  | 'failed';

/** Canvas status stored in release metadata JSONB */
export type CanvasStatus = 'not_set' | 'generated' | 'uploaded';

/** Input for generating a canvas video from album artwork */
export interface CanvasGenerationInput {
  /** Release ID to generate canvas for */
  readonly releaseId: string;
  /** URL of the source album artwork */
  readonly artworkUrl: string;
  /** Release title (used in generation prompts) */
  readonly releaseTitle: string;
  /** Artist name (used in generation prompts) */
  readonly artistName: string;
  /** Optional style preferences */
  readonly style?: CanvasStyle;
}

/** Style preferences for canvas generation */
export interface CanvasStyle {
  /** Motion type: subtle movement, zoom, particles, etc. */
  readonly motionType?: 'zoom' | 'pan' | 'particles' | 'morph' | 'ambient';
  /** Color mood override (extracted from artwork by default) */
  readonly colorMood?: string;
  /** Whether to remove text from the artwork before animating */
  readonly removeText?: boolean;
  /** Whether to AI-upscale the artwork before processing */
  readonly upscale?: boolean;
}

/** Result of a canvas generation job */
export interface CanvasGenerationResult {
  /** Whether the generation succeeded */
  readonly success: boolean;
  /** URL of the generated video (if successful) */
  readonly videoUrl?: string;
  /** URL of the processed artwork (text removed, upscaled) */
  readonly processedArtworkUrl?: string;
  /** Error message if generation failed */
  readonly error?: string;
  /** Generation metadata */
  readonly metadata?: {
    /** Duration of the generated video in seconds */
    readonly durationSec: number;
    /** Resolution of the generated video */
    readonly resolution: string;
    /** File size in bytes */
    readonly fileSizeBytes: number;
    /** AI model used for generation */
    readonly model: string;
    /** Processing time in milliseconds */
    readonly processingTimeMs: number;
  };
}

/** A canvas generation job tracked in the system */
export interface CanvasGenerationJob {
  /** Unique job ID */
  readonly id: string;
  /** Creator profile ID */
  readonly creatorProfileId: string;
  /** Release ID this canvas is for */
  readonly releaseId: string;
  /** Current job status */
  readonly status: CanvasGenerationStatus;
  /** Generation input parameters */
  readonly input: CanvasGenerationInput;
  /** Generation result (when completed) */
  readonly result?: CanvasGenerationResult;
  /** When the job was created */
  readonly createdAt: string;
  /** When the job was last updated */
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Social Ad Generation
// ---------------------------------------------------------------------------

/** Platform target for social ad generation */
export type SocialAdPlatform =
  | 'tiktok'
  | 'instagram_reels'
  | 'instagram_story'
  | 'youtube_shorts'
  | 'hulu'
  | 'generic';

/** Input for generating a social media video ad */
export interface SocialAdGenerationInput {
  /** Release ID to promote */
  readonly releaseId: string;
  /** Target platform (affects aspect ratio and duration) */
  readonly platform: SocialAdPlatform;
  /** Duration of the song clip to use (in seconds) */
  readonly clipDurationSec: number;
  /** Whether to auto-select the best clip from the song */
  readonly autoSelectClip: boolean;
  /** URL of the album artwork */
  readonly artworkUrl: string;
  /** Release title */
  readonly releaseTitle: string;
  /** Artist name */
  readonly artistName: string;
  /** Jovie profile URL for QR code generation */
  readonly jovieUrl: string;
  /** Optional promo text override (AI-generated by default) */
  readonly promoText?: string;
}

/** Result of a social ad generation */
export interface SocialAdGenerationResult {
  /** Whether generation succeeded */
  readonly success: boolean;
  /** URL of the generated video ad */
  readonly videoUrl?: string;
  /** AI-generated promotional text */
  readonly promoText?: string;
  /** QR code image URL */
  readonly qrCodeUrl?: string;
  /** Error message if failed */
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// TikTok Preview Analysis
// ---------------------------------------------------------------------------

/** A candidate clip from a song for TikTok preview */
export interface TikTokPreviewClip {
  /** Start time in seconds */
  readonly startSec: number;
  /** End time in seconds */
  readonly endSec: number;
  /** Why this clip was selected */
  readonly reason: string;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Audio features that make this clip good for previews */
  readonly features: readonly string[];
}

// ---------------------------------------------------------------------------
// Related Artist Suggestions
// ---------------------------------------------------------------------------

/** A related artist suggestion for pitching/ad targeting */
export interface RelatedArtistSuggestion {
  /** Artist name */
  readonly name: string;
  /** Spotify ID (if available) */
  readonly spotifyId?: string;
  /** Why this artist is related */
  readonly reason: string;
  /** Similarity score (0-1) */
  readonly similarity: number;
  /** Suggested use cases */
  readonly useCases: readonly (
    | 'playlist_pitching'
    | 'ad_targeting'
    | 'collaboration'
    | 'tour_support'
  )[];
}
