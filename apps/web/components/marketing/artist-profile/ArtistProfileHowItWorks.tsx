// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import { ProductShot } from '@/components/marketing/ProductShot';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import type { ProductShotId } from '@/lib/screenshots/product-shots';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

/** One registry shot per step, each cropped to the moment the step names. */
const SETUP_STAGES: readonly {
  readonly id: 'claim' | 'connect' | 'share';
  readonly shot: ProductShotId;
  readonly sizes: string;
}[] = [
  {
    id: 'claim',
    shot: 'setup-claim-handle',
    sizes: '(min-width: 1024px) 40rem, 92vw',
  },
  {
    id: 'connect',
    shot: 'setup-connect-music',
    sizes: '(min-width: 1024px) 24rem, 92vw',
  },
  {
    id: 'share',
    shot: 'setup-share-profile',
    sizes: '(min-width: 1024px) 16rem, 20rem',
  },
];

export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  return (
    <ArtistProfileSectionShell
      sectionId='how-it-works'
      sectionVariant='split-setup'
      sectionOwner='apps/web/components/marketing/artist-profile/ArtistProfileHowItWorks.tsx'
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.howItWorks}
    >
      <div className='mx-auto grid max-w-public-content items-start gap-12 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(36rem,1.28fr)] lg:gap-16'>
        <div>
          <ArtistProfileSectionHeader
            align='left'
            headline={howItWorks.headline}
            body={howItWorks.body}
            className='max-w-xl'
            bodyClassName='max-w-md'
          />

          <ol className='mt-9 border-t border-subtle'>
            {howItWorks.steps.map((step, index) => (
              <li
                key={step.id}
                className='grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-subtle py-5'
              >
                <span className='font-mono text-3xs text-tertiary-token'>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className='text-sm font-semibold text-primary-token'>
                    {step.title}
                  </h3>
                  <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <ol className='ap-how-it-works__shots'>
          {SETUP_STAGES.map((stage, index) => (
            <li
              key={stage.id}
              className={`ap-how-it-works__shot ap-how-it-works__shot--${stage.id}`}
            >
              <span
                className='font-mono text-3xs text-tertiary-token'
                aria-hidden='true'
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <ProductShot id={stage.shot} sizes={stage.sizes} />
            </li>
          ))}
        </ol>
      </div>
    </ArtistProfileSectionShell>
  );
}
