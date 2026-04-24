import { cn } from '@/lib/utils';
import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  DiscoWaxLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

interface HomeTrustSectionProps {
  readonly variant?: 'default' | 'compact';
  readonly className?: string;
  readonly presentation?: 'card' | 'inline-strip';
  /** Label rendered above the logos. Artist-profile and release-notification
   * surfaces use the default ("Trusted by artists on"); the homepage hero
   * uses the shorter "Trusted by artists". */
  readonly label?: string;
}

export function HomeTrustSection({
  variant = 'default',
  className,
  presentation = 'card',
  label = 'Trusted by artists on',
}: Readonly<HomeTrustSectionProps>) {
  const logoTone =
    presentation === 'inline-strip' ? 'text-white/68' : 'text-white/92';
  const discoWaxSize =
    presentation === 'inline-strip' ? 'h-[15px]' : 'h-[16px]';

  return (
    <section
      data-testid='homepage-trust'
      data-presentation={presentation}
      className={cn(
        presentation === 'inline-strip'
          ? 'relative z-[1] mx-auto w-full border-t border-white/[0.08] px-5 py-8 sm:px-6 sm:py-10 lg:px-0'
          : 'relative z-[1] mx-auto w-full px-5 sm:px-6 lg:px-0',
        className
      )}
      aria-label={`${label} major labels`}
    >
      <div
        className={cn(
          'mx-auto max-w-[var(--linear-content-max)]',
          presentation === 'inline-strip'
            ? 'px-0'
            : cn(
                'rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,11,15,0.96)_0%,rgba(7,8,11,1)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]',
                variant === 'compact'
                  ? 'px-5 py-5 sm:px-6 sm:py-6'
                  : 'px-6 py-7 sm:px-8 sm:py-9'
              )
        )}
      >
        <p
          className={cn(
            presentation === 'inline-strip'
              ? 'text-center text-[11px] font-medium tracking-[0.18em] text-white/46 uppercase'
              : 'text-center text-[12px] font-medium tracking-[0.02em] text-white/48',
            presentation === 'inline-strip'
              ? 'mb-6 sm:mb-7'
              : variant === 'compact'
                ? 'mb-4'
                : 'mb-5 sm:mb-6'
          )}
        >
          {label}
        </p>
        <div
          className={cn(
            presentation === 'inline-strip'
              ? 'grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-5 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-0 sm:gap-y-4 lg:flex-nowrap'
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
                'sm:px-5 lg:flex-1 lg:border-l lg:border-white/[0.08] lg:first:border-l-0'
            )}
          >
            <AwalLogo
              className={cn(
                'h-[20px] w-auto select-none sm:h-[22px]',
                logoTone
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'sm:px-5 lg:flex-1 lg:border-l lg:border-white/[0.08]'
            )}
          >
            <TheOrchardLogo
              className={cn(
                'h-[28px] w-auto select-none sm:h-[31px]',
                logoTone
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'sm:px-5 lg:flex-1 lg:border-l lg:border-white/[0.08]'
            )}
          >
            <UniversalMusicGroupLogo
              className={cn(
                'h-[14px] w-auto select-none sm:h-[16px]',
                logoTone
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'sm:px-5 lg:flex-1 lg:border-l lg:border-white/[0.08]'
            )}
          >
            <ArmadaMusicLogo
              className={cn(
                'h-[22px] w-auto select-none sm:h-[24px]',
                logoTone
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'sm:px-5 lg:flex-1 lg:border-l lg:border-white/[0.08]'
            )}
          >
            <BlackHoleRecordingsLogo
              className={cn(
                'h-[16px] w-auto sm:h-[18px]',
                presentation === 'inline-strip' && 'opacity-75'
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-center',
              presentation === 'inline-strip' &&
                'sm:px-5 lg:flex-1 lg:border-l lg:border-white/[0.08]'
            )}
          >
            <DiscoWaxLogo
              className={cn(
                discoWaxSize,
                'sm:h-[18px]',
                presentation === 'inline-strip' ? 'text-white/68' : undefined
              )}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
