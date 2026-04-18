import type { ContextMenuItemType } from '@/components/organisms/table';
import type { ReleaseViewModel } from '@/lib/discography/types';

interface GetReleaseContextMenuItemsOptions {
  release: ReleaseViewModel;
  onEdit: (release: ReleaseViewModel) => void;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onDelete?: (releaseId: string) => void;
  canGenerateAlbumArt?: boolean;
  onGenerateAlbumArt?: (release: ReleaseViewModel) => void;
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
export async function getReleaseContextMenuItems({
  release,
  onEdit,
  onCopy,
  onDelete,
  canGenerateAlbumArt,
  onGenerateAlbumArt,
  artistName,
  isSmartLinkLocked,
  getSmartLinkLockReason,
}: GetReleaseContextMenuItemsOptions): Promise<ContextMenuItemType[]> {
  const { buildReleaseActions } = await import(
    '@/features/dashboard/organisms/releases/release-actions'
  );

  return buildReleaseActions({
    release,
    onEdit,
    onCopy,
    onDelete,
    canGenerateAlbumArt,
    onGenerateAlbumArt,
    artistName,
    isSmartLinkLocked,
    getSmartLinkLockReason,
  });
}
