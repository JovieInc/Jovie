import Image from 'next/image';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import {
  getMarketingExportImage,
  type MarketingExportImage,
} from '@/lib/screenshots/registry';
import { cn } from '@/lib/utils';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileOpinionatedSection.css';

type OpinionatedSectionCopy = Pick<
  ArtistProfileLandingCopy['opinionated'],
  'headline' | 'body'
> &
  Partial<Pick<ArtistProfileLandingCopy['opinionated'], 'principle'>>;

interface ArtistProfileOpinionatedSectionProps {
  readonly opinionated: OpinionatedSectionCopy;
  /** Record renderer supplies its actual capture; legacy route keeps the owned default. */
  readonly preview?: MarketingExportImage;
  /** Distinguishes record instances while preserving the legacy occurrence by default. */
  readonly sectionOccurrence?: string;
  /** A record-owned screen-reader caption. Omitted for uncaptained factory media. */
  readonly caption?: string;
}

const LIVE_PROFILE = getMarketingExportImage('tim-white-profile-live-mobile');

export function ArtistProfileOpinionatedSection({
  opinionated,
  preview,
  sectionOccurrence = 'opinionated',
  caption,
}: Readonly<ArtistProfileOpinionatedSectionProps>) {
  const image = preview ?? LIVE_PROFILE;
  const imageAlt = preview
    ? preview.alt
    : 'Jovie artist profile leading with one clear Listen action.';
  const accessibleCaption =
    caption ??
    (preview
      ? undefined
      : 'A Jovie artist profile leads fans to the current release with one Listen action.');

  return (
    <ArtistProfileSectionShell
      sectionId='feature-split'
      sectionVariant='phone-right'
      sectionOwner='apps/web/components/marketing/artist-profile/ArtistProfileOpinionatedSection.tsx'
      sectionOccurrence={sectionOccurrence}
      className='ap-opinionated bg-surface-0'
    >
      <div className='mx-auto max-w-public-content'>
        <div className='grid items-center gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(26rem,1fr)] lg:gap-20'>
          <div className='max-w-2xl'>
            <h2
              className={cn(
                SHELL_H2_CLASS,
                'ap-opinionated__headline',
                'line-clamp-2'
              )}
            >
              {opinionated.headline}
            </h2>
            <p className={cn(SHELL_LEAD_CLASS, 'mt-6 max-w-xl')}>
              {opinionated.body}
            </p>
            {opinionated.principle ? (
              <p className='mt-8 font-mono text-xs text-tertiary-token'>
                {opinionated.principle}
              </p>
            ) : null}
          </div>

          <figure
            className='ap-opinionated__visual relative'
            data-testid='artist-profile-opinionated-profile'
          >
            {accessibleCaption ? (
              <figcaption className='sr-only'>{accessibleCaption}</figcaption>
            ) : null}
            <Image
              fill
              src={image.publicUrl}
              alt={imageAlt}
              className='object-contain object-center'
              sizes='(min-width: 1024px) 36rem, 86vw'
            />
          </figure>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
