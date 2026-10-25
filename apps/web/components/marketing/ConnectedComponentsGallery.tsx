import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { MarketingPhoneStateGallery } from '@/components/marketing/MarketingPhoneStateGallery';
import {
  CONNECTED_COMPONENTS_COPY,
  type ConnectedComponentsCopy,
} from '@/data/connectedComponentsCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

const OWNER = 'apps/web/components/marketing/ConnectedComponentsGallery.tsx';

/**
 * Three-moment demonstration rail: the real pages that back the
 * "one connected profile" story, in the order a release moves through them.
 * Shared by the cinematic homepage and the shader product pages, so the
 * claim and the evidence cannot drift between the two treatments.
 */
export function ConnectedComponentsGallery({
  copy = CONNECTED_COMPONENTS_COPY,
  className,
}: Readonly<{ copy?: ConnectedComponentsCopy; className?: string }>) {
  return (
    <ArtistProfileSectionShell
      className={className}
      sectionId='product-gallery'
      sectionVariant='release-rail'
      sectionOwner={OWNER}
      sectionOccurrence='connected-components'
      penContractId={
        MARKETING_PEN_CONTRACT_IDS.section.productGalleryReleaseRail
      }
    >
      <div data-accent='ion'>
        <h2
          id='connected-components-heading'
          className='marketing-type-section text-balance text-primary-token'
        >
          {copy.headline}
        </h2>
        <p className='marketing-type-lede mt-4 max-w-xl text-secondary-token'>
          {copy.intro}
        </p>
        <div className='mt-10'>
          <MarketingPhoneStateGallery
            states={copy.states}
            label={copy.galleryLabel}
            testId='connected-components-gallery'
          />
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
