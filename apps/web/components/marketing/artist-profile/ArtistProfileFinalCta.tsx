import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileFinalCtaProps {
  readonly finalCta: ArtistProfileLandingCopy['finalCta'];
}

export function ArtistProfileFinalCta({
  finalCta,
}: Readonly<ArtistProfileFinalCtaProps>) {
  return (
    <ArtistProfileSectionShell
      className='bg-white/[0.012]'
      containerClassName='text-center'
    >
      <h2
        data-testid='final-cta-headline'
        className='marketing-h2-linear text-primary-token'
      >
        {finalCta.headline}
      </h2>
      <p className='mx-auto mt-4 max-w-[32rem] text-[16px] leading-[1.65] text-secondary-token'>
        {finalCta.subhead}
      </p>
      <Link
        href={APP_ROUTES.SIGNUP}
        data-testid='final-cta-action'
        className='mt-8 inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-[14px] font-medium text-black transition-colors hover:bg-white/90'
      >
        {finalCta.ctaLabel}
      </Link>
    </ArtistProfileSectionShell>
  );
}
