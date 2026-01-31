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
  providerConfig: Record<ProviderKey, { label: string; accent: string }>;
  /** Artist name to display in the sidebar header */
  artistName?: string | null;
  onClose?: () => void;
  onRefresh?: () => void;
  onReleaseChange?: (release: Release) => void;
  onSave?: (release: Release) => void | Promise<void>;
  isSaving?: boolean;
  /**
   * Optional artwork upload handler. When provided and mode === 'admin',
   * the artwork becomes uploadable and this callback is used to obtain
   * the new artwork URL.
   */
  onArtworkUpload?: (file: File, release: Release) => Promise<string>;
  /**
   * Handler for adding a new DSP link
   */
  onAddDspLink?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  /**
   * Handler for removing a DSP link
   */
  onRemoveDspLink?: (releaseId: string, provider: ProviderKey) => Promise<void>;
}
