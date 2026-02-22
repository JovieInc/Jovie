import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import type { CanvasStatus } from '@/lib/services/canvas/types';

export interface ReleaseProviderMatrixProps {
  readonly releases: ReleaseViewModel[];
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  readonly primaryProviders: ProviderKey[];
  readonly spotifyConnected?: boolean;
  readonly spotifyArtistName?: string | null;
  readonly appleMusicConnected?: boolean;
  readonly appleMusicArtistName?: string | null;
  /** Whether artwork downloads are allowed on public pages */
  readonly allowArtworkDownloads?: boolean;
}

export type DraftState = Partial<Record<ProviderKey, string>>;

export type SortColumn = 'title' | 'releaseDate';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface ProviderListItem {
  key: ProviderKey;
  label: string;
  accent: string;
  isPrimary: boolean;
}

export interface UseReleaseProviderMatrixReturn {
  rows: ReleaseViewModel[];
  setRows: React.Dispatch<React.SetStateAction<ReleaseViewModel[]>>;
  editingRelease: ReleaseViewModel | null;
  drafts: DraftState;
  isSaving: boolean;
  isSyncing: boolean;
  providerList: ProviderListItem[];
  totalReleases: number;
  totalOverrides: number;
  openEditor: (release: ReleaseViewModel) => void;
  closeEditor: () => void;
  handleCopy: (path: string, label: string, testId: string) => Promise<string>;
  handleSave: (provider: ProviderKey) => void;
  handleReset: (provider: ProviderKey) => void;
  handleSync: () => void;
  handleRefreshRelease: (releaseId: string) => void;
  refreshingReleaseId: string | null;
  flashedReleaseId: string | null;
  handleRescanIsrc: (releaseId: string) => void;
  isRescanningIsrc: boolean;
  handleCanvasStatusUpdate: (
    releaseId: string,
    status: CanvasStatus
  ) => Promise<void>;
  handleAddUrl: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  handleSaveLyrics: (releaseId: string, lyrics: string) => Promise<void>;
  handleFormatLyrics: (releaseId: string, lyrics: string) => Promise<string[]>;
  isLyricsSaving: boolean;
  setDrafts: React.Dispatch<React.SetStateAction<DraftState>>;
}
