import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { cn } from '@/lib/utils';
import { MarketingSnapRail } from '../MarketingSnapRail';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileOpinionatedSection.css';

interface ArtistProfileOpinionatedSectionProps {
  readonly opinionated: ArtistProfileLandingCopy['opinionated'];
}

const LIVE_PROFILE = getMarketingExportImage('tim-white-profile-live-mobile');

function StaticMenuPreview() {
  const links = [
    'Latest Release',
    'Tour Dates',
    'Merch',
    'Subscribe',
    'Contact',
  ];

  return (
    <div
      className='ap-opinionated__menu-preview'
      role='img'
      aria-label='Static Link Menu Giving Every Destination Equal Weight.'
    >
      <div className='ap-opinionated__menu-avatar' />
      <div className='ap-opinionated__menu-name' />
      <div className='ap-opinionated__menu-links'>
        {links.map(link => (
          <div key={link} className='ap-opinionated__menu-link'>
            <span>{link}</span>
            <ArrowUpRight aria-hidden='true' size={14} strokeWidth={1.6} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArtistProfileOpinionatedSection({
  opinionated,
}: Readonly<ArtistProfileOpinionatedSectionProps>) {
  return (
    <ArtistProfileSectionShell>
      <div className='mx-auto max-w-public-content'>
        <div className='grid items-end gap-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)]'>
          <h2 className={cn(SHELL_H2_CLASS, 'ap-opinionated__headline')}>
            {opinionated.headline}
          </h2>
          <p className={cn(SHELL_LEAD_CLASS, 'max-w-xl lg:justify-self-end')}>
            {opinionated.body}
          </p>
        </div>

        <MarketingSnapRail
          ariaLabel='Static Menu And Adaptive Profile Comparison'
          instructions='Use the previous and next buttons, or swipe, to compare both approaches.'
          className='mt-12'
          railClassName='ap-opinionated__comparison'
          previousLabel='Show Static Menu Comparison'
          nextLabel='Show Adaptive Profile Comparison'
          showMobileControls
          showDesktopControls={false}
        >
          <div className='ap-opinionated__comparison-track grid min-w-168 grid-cols-2 border-y border-subtle'>
            <figure className='ap-opinionated__comparison-pane py-5 pr-5 sm:py-7 sm:pr-7'>
              <figcaption className='mb-5 flex items-baseline justify-between gap-4'>
                <strong className='text-sm font-semibold text-primary-token'>
                  Static Menu
                </strong>
                <span className='text-xs text-tertiary-token'>
                  Every option at once
                </span>
              </figcaption>
              <div className='ap-opinionated__comparison-media'>
                <StaticMenuPreview />
              </div>
            </figure>

            <figure className='ap-opinionated__comparison-pane border-l border-subtle py-5 pl-5 sm:py-7 sm:pl-7'>
              <figcaption className='mb-5 flex items-baseline justify-between gap-4'>
                <strong className='text-sm font-semibold text-primary-token'>
                  Adaptive Lead
                </strong>
                <span className='text-xs text-tertiary-token'>
                  One clear move
                </span>
              </figcaption>
              <div className='ap-opinionated__comparison-media'>
                <Image
                  fill
                  src={LIVE_PROFILE.publicUrl}
                  alt='Jovie artist profile leading with one clear Listen action.'
                  className='object-contain object-top'
                  sizes='(min-width: 1024px) 36rem, 78vw'
                />
              </div>
            </figure>
          </div>
        </MarketingSnapRail>

        <p className='mt-5 font-mono text-xs text-tertiary-token'>
          {opinionated.principle}
        </p>
      </div>
    </ArtistProfileSectionShell>
  );
}
