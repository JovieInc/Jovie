import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';
import type { ContactSidebarMode } from '@/types';

export interface AdminCreatorProfilesWithSidebarProps {
  readonly profiles: AdminCreatorProfileRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminCreatorProfilesSort;
  readonly mode?: ContactSidebarMode;
  /** Base path for pagination/sort links. Defaults to '/app/admin/creators' */
  readonly basePath?: string;
}

export type AdminCreatorSocialLinksResponse =
  | {
      success: true;
      links: Array<{
        id: string;
        label: string;
        url: string;
        platformType: string;
      }>;
    }
  | {
      success: false;
      error: string;
    };

export type IngestRefreshStatus = 'idle' | 'loading' | 'success' | 'error';

export type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';
export type { Contact, ContactSidebarMode } from '@/types';
