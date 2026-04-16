export type AlbumArtStyleId =
  | 'neo_pop_collage'
  | 'chrome_noir'
  | 'analog_dream'
  | 'minimal_icon';

export type AlbumArtResultState = 'generated' | 'needs_release_target';

export interface AlbumArtOverlayTheme {
  readonly layout: 'bottom_band' | 'center_stack' | 'quiet_corner';
  readonly titleMinSize: number;
  readonly titleMaxSize: number;
  readonly artistMinSize: number;
  readonly artistMaxSize: number;
  readonly textColor: string;
  readonly shadowColor: string;
  readonly plateColor?: string;
}

export interface AlbumArtStylePreset {
  readonly id: AlbumArtStyleId;
  readonly label: string;
  readonly description: string;
  readonly backgroundPrompt: string;
  readonly overlayTheme: AlbumArtOverlayTheme;
}

export interface AlbumArtCandidate {
  readonly id: string;
  readonly generationId: string;
  readonly styleId: AlbumArtStyleId;
  readonly styleLabel: string;
  readonly previewUrl: string;
  readonly fullResUrl: string;
  readonly generatedAt: string;
  readonly provider: 'xai';
  readonly model: string;
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly prompt: string | null;
}

export interface SuggestedReleaseTarget {
  readonly id: string;
  readonly title: string;
  readonly releaseDate: string | null;
  readonly artworkUrl: string | null;
}

export interface GeneratedAlbumArtResult {
  readonly success: true;
  readonly state: 'generated';
  readonly releaseId: string | null;
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly generationId: string;
  readonly hasExistingArtwork: boolean;
  readonly candidates: readonly AlbumArtCandidate[];
}

export interface NeedsAlbumArtReleaseTargetResult {
  readonly success: true;
  readonly state: 'needs_release_target';
  readonly releaseTitle: string | null;
  readonly artistName: string;
  readonly suggestedReleases: readonly SuggestedReleaseTarget[];
}

export interface FailedAlbumArtResult {
  readonly success: false;
  readonly retryable: boolean;
  readonly error: string;
}

export type AlbumArtToolResult =
  | GeneratedAlbumArtResult
  | NeedsAlbumArtReleaseTargetResult
  | FailedAlbumArtResult;

export interface AlbumArtManifest {
  readonly generationId: string;
  readonly profileId: string;
  readonly releaseId: string | null;
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly provider: 'xai';
  readonly model: string;
  readonly styleId: AlbumArtStyleId;
  readonly prompt: string | null;
  readonly candidates: readonly AlbumArtCandidate[];
  readonly createdAt: string;
}
