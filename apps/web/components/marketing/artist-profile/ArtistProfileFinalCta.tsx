import { APP_ROUTES } from '@/constants/routes';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import { ShellCtaButton } from './ShellCtaButton';

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
        'relative bg-surface-0',
        roomy && 'system-b-artist-profile-final-cta-roomy'
      )}
      containerClassName={cn(
        'relative text-center',
        roomy && 'flex w-full flex-col items-center justify-center'
      )}
    >
      {/* ui-casing-allow: marketing display headline */}
      <h2
        data-testid='final-cta-headline'
        className={cn(SHELL_H2_CLASS, 'mx-auto max-w-sm lg:max-w-md')}
      >
        {finalCta.headline}
      </h2>
      <p className={cn(SHELL_LEAD_CLASS, 'mx-auto mt-5 max-w-lg sm:mt-6')}>
        {finalCta.subhead}
      </p>
      {showSignature ? (
        <p className='mt-5 font-mono text-xs tracking-tight text-tertiary-token'>
          {finalCta.signature}
        </p>
      ) : null}
      <div className='mt-8'>
        <ShellCtaButton
          href={ctaHref}
          tone='primary'
          context='on-dark'
          size='lg'
          data-testid='final-cta-action'
        >
          {finalCta.ctaLabel}
        </ShellCtaButton>
      </div>
    </ArtistProfileSectionShell>
  );
}
