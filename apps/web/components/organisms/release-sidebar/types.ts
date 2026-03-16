/**
 * ReleaseSidebar Types
 *
 * Type definitions for the ReleaseSidebar component.
 */

import type {
  ProviderKey,
  ProviderLink,
  ReleaseViewModel,
  TrackViewModel,
} from '@/lib/discography/types';
import type { CanvasStatus } from '@/lib/services/canvas/types';

export type Release = ReleaseViewModel;
export type ReleaseSidebarTrack = Pick<
  TrackViewModel,
  | 'id'
  | 'releaseId'
  | 'title'
  | 'slug'
  | 'smartLinkPath'
  | 'trackNumber'
  | 'discNumber'
  | 'durationMs'
  | 'isrc'
  | 'isExplicit'
  | 'previewUrl'
  | 'audioUrl'
  | 'audioFormat'
  | 'providers'
>;

export interface ReleaseSidebarAnalytics {
  totalClicks: number;
  last7DaysClicks: number;
  providerClicks: Array<{ provider: string; clicks: number }>;
}

export interface DspLink extends ProviderLink {
  label: string;
  path: string;
  isPrimary: boolean;
}

export type ReleaseSidebarMode = 'admin' | 'view';

export interface ReleaseSidebarProps {
  readonly release: Release | null;
  readonly mode: ReleaseSidebarMode;
  readonly isOpen: boolean;
  /** Optional drawer width override in pixels */
  readonly width?: number;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  /** Artist name to display in the sidebar header */
  readonly artistName?: string | null;
  readonly onClose?: () => void;
  readonly onRefresh?: () => void;
  /** Whether a release refresh operation is currently in progress */
  readonly isRefreshing?: boolean;
  readonly onReleaseChange?: (release: Release) => void;
  readonly onSave?: (release: Release) => void | Promise<void>;
  readonly isSaving?: boolean;
  /**
   * Optional artwork upload handler. When provided and mode === 'admin',
   * the artwork becomes uploadable and this callback is used to obtain
   * the new artwork URL.
   */
  readonly onArtworkUpload?: (file: File, release: Release) => Promise<string>;
  /**
   * Handler to revert artwork to the original DSP-ingested version.
   * Receives the release ID and returns the restored artwork URL.
   */
  readonly onArtworkRevert?: (releaseId: string) => Promise<string>;
  /**
   * Handler for adding a new DSP link
   */
  readonly onAddDspLink?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  /**
   * Handler for removing a DSP link
   */
  readonly onRemoveDspLink?: (
    releaseId: string,
    provider: ProviderKey
  ) => Promise<void>;
  /**
   * Handler for rescanning ISRC codes to discover new DSP links
   */
  readonly onRescanIsrc?: () => void;
  /**
   * Whether an ISRC rescan is currently in progress
   */
  readonly isRescanningIsrc?: boolean;
  /** Persist release lyrics in metadata */
  readonly onSaveLyrics?: (releaseId: string, lyrics: string) => Promise<void>;
  /** Persist canvas status in metadata */
  readonly onCanvasStatusUpdate?: (
    releaseId: string,
    status: CanvasStatus
  ) => Promise<void>;
  /** Format lyrics for the specified platform */
  readonly onFormatLyrics?: (
    releaseId: string,
    lyrics: string,
    format: import('@/lib/lyrics/types').LyricsFormat
  ) => Promise<string[]>;
  /** Whether lyrics operations are currently pending */
  readonly isLyricsSaving?: boolean;
  /**
   * Whether album art downloads are allowed on public pages.
   * Controls the visibility of the "Allow album art downloads" setting.
   */
  readonly allowDownloads?: boolean;
  /** Optional override for the artwork downloads toggle action */
  readonly onToggleArtworkDownloads?: (enabled: boolean) => Promise<void>;
  /**
   * When true, disables editing capabilities (artwork upload, add/remove links).
   * Used for free-plan users who can view but not modify their smartlinks.
   */
  readonly readOnly?: boolean;
  /** Optional static track data used instead of the live sidebar API */
  readonly tracksOverride?: ReleaseSidebarTrack[];
  /** Optional static analytics data used instead of the live sidebar API */
  readonly analyticsOverride?: ReleaseSidebarAnalytics | null;
  readonly onTrackClick?: (track: {
    id: string;
    title: string;
    slug: string;
    smartLinkPath: string;
    trackNumber: number;
    discNumber: number;
    durationMs: number | null;
    isrc: string | null;
    isExplicit: boolean;
    providers: Array<{ key: ProviderKey; label: string; url: string }>;
    releaseId: string;
    previewUrl?: string | null;
    audioUrl?: string | null;
    audioFormat?: string | null;
  }) => void;
}
