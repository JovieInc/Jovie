import { FilePenLine } from 'lucide-react';
import { APP_ROUTES } from '@/constants/routes';
import type { LibraryReleaseAsset } from './library-data';
import type { LibraryEntityAction } from './library-entity-actions';

export function buildPrivatePromotionAction(
  asset: LibraryReleaseAsset,
  profileId: string | null,
  open: (url: string) => void
): LibraryEntityAction | null {
  if (
    !profileId ||
    (asset.itemKind ?? 'release') !== 'release' ||
    asset.status === 'draft' ||
    asset.lifecycleStatus === 'archived'
  ) return null;
  return {
    id: 'draft-promotion',
    label: 'Draft Private Promotion',
    icon: FilePenLine,
    authority: 'profile-owner',
    disabled: false,
    destructive: false,
    onExecute: () =>
      open(`${APP_ROUTES.LIBRARY}?promotion=${encodeURIComponent(asset.id)}`),
  };
}
