import { cn } from '@/lib/utils';
import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  BlancoYNegroLogo,
  DiscoWaxLogo,
  RecPlayLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

interface HomeTrustSectionProps {
  readonly variant?: 'default' | 'compact';
  readonly className?: string;
  readonly presentation?: 'card' | 'inline-strip';
  /** Label rendered above the logos. Artist-profile and release-notification
   * surfaces use the default ("Trusted by artists and teams releasing on");
   * the homepage hero historically used a shorter variant. */
  readonly label?: string;
}

function getInnerBoxClass(
  isInlineStrip: boolean,
  variant: 'default' | 'compact'
): string {
  if (isInlineStrip) return 'px-0';
  return cn(
    'rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,11,15,0.96)_0%,rgba(7,8,11,1)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]',
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

export function HomeTrustSection({
  variant = 'default',
  className,
  presentation = 'card',
  label = 'Trusted by artists and teams releasing on',
}: Readonly<HomeTrustSectionProps>) {
  const isInlineStrip = presentation === 'inline-strip';
  const logoTone = isInlineStrip ? 'text-white/62' : 'text-white/55';
  const innerBoxClass = getInnerBoxClass(isInlineStrip, variant);
  const labelMarginClass = isInlineStrip
    ? 'mb-8 sm:mb-10'
    : getLabelMarginClass(isInlineStrip, variant);

  return (
    <section
      data-testid='homepage-trust'
      data-presentation={presentation}
      className={cn(
        // Bundle pattern: dim/monochrome wide-gap row on a soft proof strip.
        // Card variant retains its bordered surface for artist-profile /
        // notifications surfaces.
        isInlineStrip
          ? 'relative z-[1] mx-auto w-full overflow-hidden px-5 py-12 sm:px-6 sm:py-14 lg:px-0'
          : 'relative z-[1] mx-auto w-full px-5 sm:px-6 lg:px-0',
        className
      )}
      aria-label={`${label} major labels`}
    >
      <div
        className={cn(
          isInlineStrip
            ? 'mx-auto max-w-[1320px] text-center'
            : 'mx-auto max-w-[var(--linear-content-max)]',
          innerBoxClass
        )}
      >
        <p
          className={cn(
            'text-center font-medium tracking-[0.01em]',
            isInlineStrip
              ? 'text-[12px] text-white/36'
              : 'text-[12px] text-white/56',
            labelMarginClass
          )}
        >
          {label}
        </p>
        <div
          className={cn(
            presentation === 'inline-strip'
              ? 'homepage-trust-logo-grid'
              : 'grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-6 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-10 sm:gap-y-5 lg:flex-nowrap lg:justify-between',
            variant === 'compact' &&
              presentation !== 'inline-strip' &&
              'gap-x-5 gap-y-5 sm:gap-x-8'
          )}
        >
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'homepage-trust-logo-slot homepage-trust-logo-slot--awal'
            )}
          >
            <AwalLogo
              className={cn(
                isInlineStrip
                  ? 'homepage-trust-logo homepage-trust-logo--awal w-auto max-w-[38vw] select-none'
                  : 'h-[20px] w-auto max-w-[36vw] select-none sm:h-[22px]',
                logoTone
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'homepage-trust-logo-slot homepage-trust-logo-slot--orchard'
            )}
          >
            <TheOrchardLogo
              className={cn(
                isInlineStrip
                  ? 'homepage-trust-logo homepage-trust-logo--orchard w-auto max-w-[44vw] select-none'
                  : 'h-[28px] w-auto max-w-[34vw] select-none sm:h-[31px]',
                logoTone
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'homepage-trust-logo-slot homepage-trust-logo-slot--umg'
            )}
          >
            <UniversalMusicGroupLogo
              className={cn(
                isInlineStrip
                  ? 'homepage-trust-logo homepage-trust-logo--umg h-auto max-w-[52vw] select-none'
                  : 'h-[14px] w-auto max-w-[72vw] select-none sm:h-[16px]',
                logoTone
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'homepage-trust-logo-slot homepage-trust-logo-slot--armada'
            )}
          >
            <ArmadaMusicLogo
              className={cn(
                isInlineStrip
                  ? 'homepage-trust-logo homepage-trust-logo--armada w-auto max-w-[44vw] select-none'
                  : 'h-[22px] w-auto max-w-[38vw] select-none sm:h-[24px]',
                logoTone
              )}
            />
          </div>
          <div
            data-mobile-logo='secondary'
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'homepage-trust-logo-slot homepage-trust-logo-slot--black-hole'
            )}
          >
            <BlackHoleRecordingsLogo
              className={cn(
                isInlineStrip
                  ? 'homepage-trust-logo homepage-trust-logo--black-hole h-auto'
                  : 'h-[16px] w-auto sm:h-[18px]'
              )}
            />
          </div>
          {isInlineStrip ? (
            <>
              <div
                data-mobile-logo='secondary'
                className='flex min-w-0 items-center justify-center homepage-trust-logo-slot homepage-trust-logo-slot--disco-wax'
              >
                <DiscoWaxLogo
                  className={cn(
                    'homepage-trust-logo homepage-trust-logo--disco-wax w-auto max-w-[36vw] select-none',
                    logoTone
                  )}
                />
              </div>
              <div
                data-mobile-logo='secondary'
                className='flex min-w-0 items-center justify-center homepage-trust-logo-slot homepage-trust-logo-slot--blanco'
              >
                <BlancoYNegroLogo
                  className={cn(
                    'homepage-trust-logo homepage-trust-logo--blanco w-auto max-w-[42vw] select-none',
                    logoTone
                  )}
                />
              </div>
              <div
                data-mobile-logo='secondary'
                className='flex min-w-0 items-center justify-center homepage-trust-logo-slot homepage-trust-logo-slot--rec-play'
              >
                <RecPlayLogo
                  className={cn(
                    'homepage-trust-logo homepage-trust-logo--rec-play w-auto max-w-[34vw] select-none',
                    logoTone
                  )}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
