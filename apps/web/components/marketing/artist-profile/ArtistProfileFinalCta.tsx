import { Button } from '@jovie/ui';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileFinalCtaProps {
  readonly finalCta: ArtistProfileLandingCopy['finalCta'];
  readonly ctaHref?: string;
  readonly roomy?: boolean;
  readonly showSignature?: boolean;
}

export function ArtistProfileFinalCta({
  finalCta,
  ctaHref = APP_ROUTES.SIGNUP,
  roomy = false,
  showSignature = false,
}: Readonly<ArtistProfileFinalCtaProps>) {
  return (
    <ArtistProfileSectionShell
      className={cn(
        'relative bg-white/[0.012]',
        roomy &&
          'flex min-h-[56svh] items-center sm:min-h-[60svh] lg:min-h-[66svh]'
      )}
      containerClassName={cn(
        'relative text-center',
        roomy && 'flex w-full flex-col items-center justify-center'
      )}
    >
      <h2
        data-testid='final-cta-headline'
        className={cn(SHELL_H2_CLASS, 'mx-auto max-w-[16ch] lg:max-w-[20ch]')}
      >
        {finalCta.headline}
      </h2>
      <p className={cn(SHELL_LEAD_CLASS, 'mx-auto mt-5 max-w-[34rem] sm:mt-6')}>
        {finalCta.subhead}
      </p>
      {showSignature ? (
        <p className='mt-5 font-mono text-xs tracking-tight text-tertiary-token'>
          {finalCta.signature}
        </p>
      ) : null}
      <div className='mt-8'>
        <Button asChild variant='primary' size='lg'>
          <Link href={ctaHref} data-testid='final-cta-action'>
            {finalCta.ctaLabel}
          </Link>
        </Button>
      </div>
    </ArtistProfileSectionShell>
  );
}
