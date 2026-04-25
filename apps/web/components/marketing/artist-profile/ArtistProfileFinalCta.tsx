import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileFinalCtaProps {
  readonly finalCta: ArtistProfileLandingCopy['finalCta'];
  readonly ctaHref?: string;
  readonly roomy?: boolean;
}

export function ArtistProfileFinalCta({
  finalCta,
  ctaHref = APP_ROUTES.SIGNUP,
  roomy = false,
}: Readonly<ArtistProfileFinalCtaProps>) {
  return (
    <ArtistProfileSectionShell
      className={cn(
        'bg-white/[0.012]',
        roomy &&
          'flex min-h-[56svh] items-center sm:min-h-[60svh] lg:min-h-[66svh]'
      )}
      containerClassName={cn(
        'text-center',
        roomy && 'flex w-full flex-col items-center justify-center'
      )}
    >
      <h2
        data-testid='final-cta-headline'
        className='mx-auto max-w-[14ch] text-balance text-[clamp(2.7rem,5.25vw,4.6rem)] font-[650] leading-[0.94] tracking-[-0.072em] text-primary-token lg:max-w-none'
      >
        {finalCta.headline}
      </h2>
      <p className='mx-auto mt-3 max-w-[29rem] text-[15px] leading-[1.55] text-secondary-token'>
        {finalCta.subhead}
      </p>
      <Link
        href={ctaHref}
        data-testid='final-cta-action'
        className='mt-6 inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-[14px] font-medium text-black transition-colors hover:bg-white/90'
      >
        {finalCta.ctaLabel}
      </Link>
    </ArtistProfileSectionShell>
  );
}
