import Link from 'next/link';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { cn } from '@/lib/utils';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileFinalCta.css';

interface ArtistProfileFinalCtaProps {
  readonly finalCta: ArtistProfileLandingCopy['finalCta'];
  readonly ctaHref?: string;
  readonly roomy?: boolean;
  readonly showSignature?: boolean;
}

export function ArtistProfileFinalCta({
  finalCta,
  ctaHref,
  roomy = false,
  showSignature = false,
}: Readonly<ArtistProfileFinalCtaProps>) {
  const claimIntent = getClaimProfileIntent();
  const href = ctaHref ?? claimIntent.href;
  const label = finalCta.ctaLabel || claimIntent.label;

  return (
    <ArtistProfileSectionShell
      className={cn('ap-final-cta relative', roomy && 'flex items-center')}
      containerClassName={cn(
        'relative text-center',
        roomy && 'flex w-full flex-col items-center justify-center'
      )}
    >
      {/* ui-casing-allow: marketing display headline */}
      <h2
        data-testid='final-cta-headline'
        className={cn(SHELL_H2_CLASS, 'ap-final-cta__headline mx-auto')}
      >
        {finalCta.headline}
      </h2>
      <p
        className={cn(
          SHELL_LEAD_CLASS,
          'ap-final-cta__lead mx-auto mt-5 sm:mt-6'
        )}
      >
        {finalCta.subhead}
      </p>
      {showSignature ? (
        <p className='mt-5 font-mono text-xs tracking-tight text-tertiary-token'>
          {finalCta.signature}
        </p>
      ) : null}
      <div className='mt-8 flex flex-col items-center gap-3'>
        {/* Navigating control: no press-scale — public-action-primary is color/opacity only. */}
        <Link
          href={href}
          data-testid='final-cta-action'
          data-analytics-event={claimIntent.eventName}
          data-analytics-source='artist-profiles-final-cta'
          className='public-action-primary'
        >
          {label}
        </Link>
        <p className='text-xs font-medium tracking-wide text-tertiary-token'>
          {claimIntent.support}
        </p>
      </div>
    </ArtistProfileSectionShell>
  );
}
