// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import Image from 'next/image';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { MarketingSnapRail } from '../MarketingSnapRail';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileSocialProofProps {
  readonly socialProof: ArtistProfileLandingCopy['socialProof'];
  readonly proofData: ArtistProfileSocialProofData;
}

interface ArtistProfileReleaseCycleGalleryProps {
  readonly releaseCycle: ArtistProfileLandingCopy['releaseCycle'];
}

const PROFILE_STATES = [
  {
    id: 'presave',
    label: 'Before The Drop',
    action: 'Release Alerts',
    image: getMarketingExportImage('tim-white-profile-subscribe-mobile'),
    alt: 'Tim White artist profile inviting fans to get release updates.',
  },
  {
    id: 'tour',
    label: 'On The Road',
    action: 'Nearby Tickets',
    image: getMarketingExportImage('tim-white-profile-tour-mobile'),
    alt: 'Tim White artist profile showing nearby tour dates.',
  },
  {
    id: 'pay',
    label: 'In The Room',
    action: 'Direct Support',
    image: getMarketingExportImage('tim-white-profile-pay-mobile'),
    alt: 'Tim White artist profile showing direct support options.',
  },
] as const;

export function ArtistProfileSocialProof({
  socialProof,
  proofData,
}: Readonly<ArtistProfileSocialProofProps>) {
  if (!proofData.hasRealQuotes) {
    return null;
  }

  return (
    <ArtistProfileSectionShell
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.socialProof}
    >
      <ArtistProfileSectionHeader
        align='left'
        headline={socialProof.headline}
        body={socialProof.intro}
        className='max-w-3xl'
      />

      <div className='mt-10 grid gap-4 lg:grid-cols-3'>
        {proofData.quotes.map(quote => (
          <article key={quote.id} className='border-t border-subtle pt-5'>
            <p className='text-sm leading-relaxed text-primary-token'>
              {quote.quote}
            </p>
            <p className='mt-6 text-app font-semibold text-primary-token'>
              {quote.name}
            </p>
            <p className='mt-1 text-xs text-tertiary-token'>{quote.role}</p>
          </article>
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}

export function ArtistProfileReleaseCycleGallery({
  releaseCycle,
}: Readonly<ArtistProfileReleaseCycleGalleryProps>) {
  return (
    <ArtistProfileSectionShell>
      <div className='mx-auto max-w-public-content'>
        <ArtistProfileSectionHeader
          align='left'
          headline={releaseCycle.headline}
          body={releaseCycle.intro}
          className='max-w-3xl'
          bodyClassName='max-w-xl'
        />

        <p className='mt-8 font-mono text-xs text-tertiary-token'>
          One profile across three moments.
        </p>

        <MarketingSnapRail
          ariaLabel='One Artist Profile Across Three Release-cycle Moments'
          instructions='Use the previous and next buttons, or swipe, to view every moment.'
          className='mt-7'
          railClassName='ap-profile-gallery'
          previousLabel='Show Previous Release-cycle Moment'
          nextLabel='Show Next Release-cycle Moment'
          showMobileControls
          showDesktopControls={false}
        >
          {PROFILE_STATES.map(state => (
            <figure key={state.id} className='snap-start'>
              <div className='ap-profile-gallery__frame relative overflow-hidden border border-subtle bg-surface-0'>
                <Image
                  fill
                  src={state.image.publicUrl}
                  alt={state.alt}
                  className='object-contain object-top'
                  sizes='(min-width: 1024px) 28vw, 78vw'
                />
              </div>
              <figcaption className='mt-4 flex items-baseline justify-between gap-4 border-t border-subtle pt-3'>
                <strong className='text-sm font-semibold text-primary-token'>
                  {state.label}
                </strong>
                <span className='text-xs text-tertiary-token'>
                  {state.action}
                </span>
              </figcaption>
            </figure>
          ))}
        </MarketingSnapRail>
      </div>
    </ArtistProfileSectionShell>
  );
}
