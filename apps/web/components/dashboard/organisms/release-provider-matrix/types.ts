import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

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
  headerElevated: boolean;
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  providerList: ProviderListItem[];
  totalReleases: number;
  totalOverrides: number;
  sortState: SortState;
  toggleSort: (column: SortColumn) => void;
  openEditor: (release: ReleaseViewModel) => void;
  closeEditor: () => void;
  handleCopy: (path: string, label: string, testId: string) => Promise<string>;
  handleSave: (provider: ProviderKey) => void;
  handleReset: (provider: ProviderKey) => void;
  handleSync: () => void;
  handleRefreshRelease: (releaseId: string) => void;
  handleAddUrl: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  setDrafts: React.Dispatch<React.SetStateAction<DraftState>>;
}
