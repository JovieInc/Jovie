import type {
  ReleaseSidebarAnalytics,
  ReleaseSidebarTrack,
} from '@/components/organisms/release-sidebar/types';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import type { PlanGateEntitlements } from '@/lib/queries';
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
  /** Whether a Spotify import is currently in progress (from server) */
  readonly initialImporting?: boolean;
  /** Optional adapter that swaps live behaviors for demo/static rendering */
  readonly experienceAdapter?: ReleaseExperienceAdapter;
}

export interface ReleaseSidebarFixtureData {
  readonly analytics?: ReleaseSidebarAnalytics | null;
  readonly tracks?: ReleaseSidebarTrack[];
}

export interface ReleaseExperienceAdapter {
  readonly mode?: 'live' | 'demo';
  readonly entitlements?: Partial<PlanGateEntitlements>;
  readonly onCopy?: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string>;
  readonly onCreateRelease?: () => void;
  readonly onSync?: () => void;
  readonly onRefreshRelease?: (releaseId: string) => void;
  readonly onArtworkUpload?: (
    file: File,
    release: ReleaseViewModel
  ) => Promise<string>;
  readonly onArtworkRevert?: (
    releaseId: string,
    release: ReleaseViewModel | null
  ) => Promise<string>;
  readonly onAddDspLink?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  readonly onRescanIsrc?: (releaseId: string) => void;
  readonly onSaveLyrics?: (releaseId: string, lyrics: string) => Promise<void>;
  readonly onFormatLyrics?: (
    releaseId: string,
    lyrics: string
  ) => Promise<string[]>;
  readonly onCanvasStatusUpdate?: (
    releaseId: string,
    status: CanvasStatus
  ) => Promise<void>;
  readonly onToggleArtworkDownloads?: (enabled: boolean) => Promise<void>;
  readonly sidebarDataByReleaseId?: Record<string, ReleaseSidebarFixtureData>;
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
