import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

interface HomeTrustSectionProps {
  readonly variant?: 'default' | 'compact';
  readonly className?: string;
  readonly presentation?: 'card' | 'inline-strip' | 'proof-moment';
  /** Label rendered above the logos. Artist-profile and release-notification
   * surfaces use the default ("Trusted by artists and teams releasing on");
   * the homepage hero historically used a shorter variant. */
  readonly label?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly ariaLabel?: string;
}

function getInnerBoxClass(
  presentation: 'card' | 'inline-strip' | 'proof-moment',
  variant: 'default' | 'compact'
): string {
  if (presentation === 'inline-strip') {
    return 'system-b-mounted-home-trust-strip-inner';
  }
  if (presentation === 'proof-moment') {
    return 'homepage-trust-proof-moment__inner';
  }
  return cn(
    'rounded-3xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,11,15,0.96)_0%,rgba(7,8,11,1)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]',
    variant === 'compact'
      ? 'px-5 py-5 sm:px-6 sm:py-6'
      : 'px-6 py-7 sm:px-8 sm:py-9'
  );
}

function getLabelMarginClass(
  isInlineStrip: boolean,
  variant: 'default' | 'compact'
): string {
  if (variant === 'compact' && !isInlineStrip) return 'mb-4';
  return 'mb-5 sm:mb-6';
}

function getSlotClass(
  presentation: 'card' | 'inline-strip' | 'proof-moment',
  slotName: string
): string {
  const isInlineStrip = presentation === 'inline-strip';
  const isProofMoment = presentation === 'proof-moment';
  return cn(
    'flex min-w-0 items-center justify-center',
    isInlineStrip &&
      `homepage-trust-logo-slot homepage-trust-logo-slot--${slotName} system-b-mounted-home-trust-strip-logo-slot system-b-mounted-home-trust-strip-logo-slot--${slotName}`,
    isProofMoment &&
      `homepage-trust-proof-moment__logo-slot homepage-trust-proof-moment__logo-slot--${slotName}`
  );
}

function getLogoClass(
  presentation: 'card' | 'inline-strip' | 'proof-moment',
  inlineClass: string,
  proofMomentClass: string,
  cardClass: string,
  tone: string
): string {
  if (presentation === 'inline-strip') return cn(inlineClass, tone);
  if (presentation === 'proof-moment') return proofMomentClass;
  return cn(cardClass, tone);
}

export function HomeTrustSection({
  variant = 'default',
  className,
  presentation = 'card',
  label = 'Trusted by artists and teams releasing on',
  eyebrow = 'Artist proof',
  ariaLabel,
}: Readonly<HomeTrustSectionProps>) {
  const isInlineStrip = presentation === 'inline-strip';
  const isProofMoment = presentation === 'proof-moment';
  const accessibleLabel =
    ariaLabel ?? (typeof label === 'string' ? label : 'Artist distribution');
  const logoTone = isInlineStrip ? '' : 'text-white/55';
  const innerBoxClass = getInnerBoxClass(presentation, variant);
  const labelMarginClass = getLabelMarginClass(isInlineStrip, variant);

  return (
    <section
      data-testid='homepage-trust'
      data-presentation={presentation}
      className={cn(
        isInlineStrip
          ? 'system-b-mounted-home-trust-strip'
          : isProofMoment
            ? 'homepage-trust-proof-moment'
            : 'relative z-[1] mx-auto w-full px-5 sm:px-6 lg:px-0',
        className
      )}
      aria-label={`${accessibleLabel} major labels`}
    >
      <div
        className={cn(
          isInlineStrip
            ? 'homepage-trust-strip-inner'
            : isProofMoment
              ? ''
              : 'mx-auto max-w-linear-content',
          innerBoxClass
        )}
      >
        {isProofMoment ? (
          <div className='homepage-trust-proof-moment__copy'>
            <p className='homepage-trust-proof-moment__eyebrow'>{eyebrow}</p>
            <h2 className='homepage-trust-proof-moment__headline'>{label}</h2>
          </div>
        ) : (
          <div
            className={cn(
              isInlineStrip
                ? 'system-b-mounted-home-trust-strip-label'
                : 'text-center font-medium tracking-wide text-xs text-white/56',
              !isInlineStrip && labelMarginClass
            )}
          >
            {label}
          </div>
        )}
        <div
          className={cn(
            isInlineStrip
              ? 'homepage-trust-logo-grid system-b-mounted-home-trust-strip-logo-grid'
              : isProofMoment
                ? 'homepage-trust-proof-moment__logo-grid'
                : 'grid grid-cols-1 items-center justify-items-center gap-x-6 gap-y-6 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-10 sm:gap-y-5 lg:flex-nowrap lg:justify-between',
            variant === 'compact' &&
              presentation === 'card' &&
              'gap-x-5 gap-y-5 sm:gap-x-8'
          )}
        >
          <div className={getSlotClass(presentation, 'awal')}>
            <AwalLogo
              className={getLogoClass(
                presentation,
                'homepage-trust-logo homepage-trust-logo--awal system-b-mounted-home-trust-strip-logo system-b-mounted-home-trust-strip-logo--awal',
                'homepage-trust-proof-moment__logo homepage-trust-proof-moment__logo--awal',
                'h-5 w-auto max-w-[36vw] select-none sm:h-6',
                logoTone
              )}
            />
          </div>
          <div className={getSlotClass(presentation, 'orchard')}>
            <TheOrchardLogo
              className={getLogoClass(
                presentation,
                'homepage-trust-logo homepage-trust-logo--orchard system-b-mounted-home-trust-strip-logo system-b-mounted-home-trust-strip-logo--orchard',
                'homepage-trust-proof-moment__logo homepage-trust-proof-moment__logo--orchard',
                'h-7 w-auto max-w-[34vw] select-none sm:h-8',
                logoTone
              )}
            />
          </div>
          <div className={getSlotClass(presentation, 'umg')}>
            <UniversalMusicGroupLogo
              className={getLogoClass(
                presentation,
                'homepage-trust-logo homepage-trust-logo--umg system-b-mounted-home-trust-strip-logo system-b-mounted-home-trust-strip-logo--umg',
                'homepage-trust-proof-moment__logo homepage-trust-proof-moment__logo--umg',
                'h-4 w-auto max-w-[72vw] select-none sm:h-4',
                logoTone
              )}
            />
          </div>
          <div className={getSlotClass(presentation, 'armada')}>
            <ArmadaMusicLogo
              className={getLogoClass(
                presentation,
                'homepage-trust-logo homepage-trust-logo--armada system-b-mounted-home-trust-strip-logo system-b-mounted-home-trust-strip-logo--armada',
                'homepage-trust-proof-moment__logo homepage-trust-proof-moment__logo--armada',
                'h-6 w-auto max-w-[38vw] select-none sm:h-6',
                logoTone
              )}
            />
          </div>
          <div
            data-mobile-logo='secondary'
            className={getSlotClass(presentation, 'black-hole')}
          >
            <BlackHoleRecordingsLogo
              className={getLogoClass(
                presentation,
                'homepage-trust-logo homepage-trust-logo--black-hole system-b-mounted-home-trust-strip-logo system-b-mounted-home-trust-strip-logo--black-hole',
                'homepage-trust-proof-moment__logo homepage-trust-proof-moment__logo--black-hole',
                'h-4 w-auto sm:h-5',
                ''
              )}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
