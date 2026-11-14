import { Button } from '@jovie/ui';
import { InspectorSection } from '@/components/molecules/inspector';
import type { LibraryReleaseAsset } from './library-data';

import { isLibraryTakeAsset } from './library-take-assets';

export { libraryWorkView } from './library-take-assets';

/**
 * A private studio take only plays, through its owner-checked media route.
 * It has no share, review status, publish or files in the Work drawer.
 */
export function LibraryTakeActions({
  asset,
  open,
}: {
  readonly asset: LibraryReleaseAsset;
  /** A closing drawer keeps the link out of the tab order. */
  readonly open: boolean;
}) {
  if (!isLibraryTakeAsset(asset) || !asset.primaryActionHref) return null;
  return (
    <InspectorSection title='Actions' className='py-3 first:pt-0'>
      <Button asChild variant='secondary' size='sm'>
        <a
          href={asset.primaryActionHref}
          target='_blank'
          rel='noopener noreferrer'
          tabIndex={open ? undefined : -1}
        >
          Watch Take
        </a>
      </Button>
    </InspectorSection>
  );
}
