import type { ReactNode } from 'react';
import { NormalizedTrustLogo } from '@/components/media/NormalizedTrustLogo';
import { TRUST_LOGO_ASSETS } from '@/components/media/trustLogoAssets';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { cn } from '@/lib/utils';

interface HomeTrustSectionProps {
  readonly variant?: 'default' | 'compact';
  readonly className?: string;
  readonly presentation?: 'card' | 'inline-strip';
  /** Label rendered above the logos. Artist-profile and release-notification
   * surfaces use the default ("Trusted by artists and teams releasing on");
   * the homepage hero historically used a shorter variant. */
  readonly label?: ReactNode;
  readonly ariaLabel?: string;
}

function getInnerBoxClass(
  isInlineStrip: boolean,
  variant: 'default' | 'compact'
): string {
  if (isInlineStrip) return 'system-b-mounted-home-trust-strip-inner';
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

function getSlotClass(isInlineStrip: boolean, slotName: string): string {
  return cn(
    'flex min-w-0 items-center justify-center',
    isInlineStrip &&
      `homepage-trust-logo-slot homepage-trust-logo-slot--${slotName} system-b-mounted-home-trust-strip-logo-slot system-b-mounted-home-trust-strip-logo-slot--${slotName}`
  );
}

export function HomeTrustSection({
  variant = 'default',
  className,
  presentation = 'card',
  label = 'Trusted by artists and teams releasing on',
  ariaLabel,
}: Readonly<HomeTrustSectionProps>) {
  const isInlineStrip = presentation === 'inline-strip';
  const accessibleLabel =
    ariaLabel ?? (typeof label === 'string' ? label : 'Artist distribution');
  const logoTone = isInlineStrip ? '' : 'text-white/55';
  const innerBoxClass = getInnerBoxClass(isInlineStrip, variant);
  const labelMarginClass = getLabelMarginClass(isInlineStrip, variant);

  return (
    <section
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.logoCloud}
      data-testid='homepage-trust'
      data-presentation={presentation}
      className={cn(
        isInlineStrip
          ? 'system-b-mounted-home-trust-strip'
          : 'relative z-[1] mx-auto w-full px-5 sm:px-6 lg:px-0',
        className
      )}
      aria-label={`${accessibleLabel} major labels`}
    >
      <div
        className={cn(
          isInlineStrip
            ? 'homepage-trust-strip-inner'
            : 'mx-auto max-w-linear-content',
          innerBoxClass
        )}
      >
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
        <div
          className={cn(
            isInlineStrip
              ? 'homepage-trust-logo-grid system-b-mounted-home-trust-strip-logo-grid'
              : 'grid grid-cols-1 items-center justify-items-center gap-x-6 gap-y-6 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-10 sm:gap-y-5 lg:flex-nowrap lg:justify-between',
            variant === 'compact' &&
              !isInlineStrip &&
              'gap-x-5 gap-y-5 sm:gap-x-8'
          )}
        >
          {TRUST_LOGO_ASSETS.map(asset => {
            const slotName =
              asset.id === 'black-hole-recordings' ? 'black-hole' : asset.id;
            return (
              <div
                key={asset.id}
                data-mobile-logo={
                  asset.id === 'black-hole-recordings' ? 'secondary' : undefined
                }
                className={getSlotClass(isInlineStrip, slotName)}
              >
                <NormalizedTrustLogo
                  id={asset.id}
                  className={cn(
                    'homepage-trust-logo system-b-mounted-home-trust-strip-logo',
                    logoTone
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
