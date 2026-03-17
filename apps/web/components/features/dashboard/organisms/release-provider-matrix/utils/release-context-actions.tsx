import type { ContextMenuItemType } from '@/components/organisms/table';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import type { ReleaseViewModel } from '@/lib/discography/types';

interface GetReleaseContextMenuItemsOptions {
  release: ReleaseViewModel;
  onEdit: (release: ReleaseViewModel) => void;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  artistName?: string | null;
  isSmartLinkLocked?: (releaseId: string) => boolean;
  getSmartLinkLockReason?: (releaseId: string) => 'scheduled' | 'cap' | null;
}

/**
 * Build context menu items for a release row.
 * Shared between desktop context menu and mobile swipe actions.
 *
 * Delegates to the canonical `buildReleaseActions` builder.
 */
export function getReleaseContextMenuItems({
  release,
  onEdit,
  onCopy,
  artistName,
  isSmartLinkLocked,
  getSmartLinkLockReason,
}: GetReleaseContextMenuItemsOptions): ContextMenuItemType[] {
  return buildReleaseActions({
    release,
    onEdit,
    onCopy,
    artistName,
    isSmartLinkLocked,
    getSmartLinkLockReason,
  });
}
