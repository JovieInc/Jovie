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
      className='bg-white/[0.012] py-20 sm:py-24 lg:py-28'
      containerClassName='text-center'
    >
      <h2
        data-testid='final-cta-headline'
        className='mx-auto max-w-[11ch] text-[clamp(2.9rem,5vw,5rem)] font-semibold leading-[0.92] tracking-[-0.075em] text-primary-token'
      >
        {finalCta.headline}
      </h2>
      <p className='mx-auto mt-3 max-w-[29rem] text-[15px] leading-[1.55] text-secondary-token'>
        {finalCta.subhead}
      </p>
      <Link
        href={APP_ROUTES.SIGNUP}
        data-testid='final-cta-action'
        className='mt-6 inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-[14px] font-medium text-black transition-colors hover:bg-white/90'
      >
        {finalCta.ctaLabel}
      </Link>
    </ArtistProfileSectionShell>
  );
}
