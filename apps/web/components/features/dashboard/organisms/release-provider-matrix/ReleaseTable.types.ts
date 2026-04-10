import type { TrackSidebarData } from '@/components/organisms/release-sidebar';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

export interface ProviderConfig {
  label: string;
  readonly accent: string;
}

export interface ReleaseTableProps {
  readonly releases: ReleaseViewModel[];
  readonly providerConfig: Record<ProviderKey, ProviderConfig>;
  readonly artistName?: string | null;
  readonly onCopy: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string>;
  readonly onEdit: (release: ReleaseViewModel) => void;
  readonly columnVisibility?: Record<string, boolean>;
  readonly rowHeight?: number;
  readonly onFocusedRowChange?: (release: ReleaseViewModel) => void;
  readonly showTracks?: boolean;
  readonly groupByYear?: boolean;
  readonly refreshingReleaseId?: string | null;
  readonly flashedReleaseId?: string | null;
  readonly selectedReleaseId?: string | null;
  readonly selectedTrackId?: string | null;
  readonly isSmartLinkLocked?: (releaseId: string) => boolean;
  readonly getSmartLinkLockReason?: (
    releaseId: string
  ) => 'scheduled' | 'cap' | null;
  readonly onTrackClick?: (trackData: TrackSidebarData) => void;
}
