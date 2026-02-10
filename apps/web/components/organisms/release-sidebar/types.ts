/**
 * ReleaseSidebar Types
 *
 * Type definitions for the ReleaseSidebar component.
 */

import type {
  ProviderKey,
  ProviderLink,
  ReleaseViewModel,
} from '@/lib/discography/types';

export type Release = ReleaseViewModel;

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
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  /** Artist name to display in the sidebar header */
  readonly artistName?: string | null;
  readonly onClose?: () => void;
  readonly onRefresh?: () => void;
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
  /**
   * Whether album art downloads are allowed on public pages.
   * Controls the visibility of the "Allow album art downloads" setting.
   */
  readonly allowDownloads?: boolean;
}
