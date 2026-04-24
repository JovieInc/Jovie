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
  /** Label rendered above the logos. Artist-profile and release-notification
   * surfaces use the default ("Trusted by artists on"); the homepage hero
   * uses the shorter "Trusted by artists". */
  readonly label?: string;
}

export function HomeTrustSection({
  variant = 'default',
  className,
  label = 'Trusted by artists on',
}: Readonly<HomeTrustSectionProps>) {
  return (
    <section
      data-testid='homepage-trust'
      className={cn(
        'relative z-[1] mx-auto w-full px-5 sm:px-6 lg:px-0',
        className
      )}
      aria-label={`${label} major labels`}
    >
      <div
        className={cn(
          'mx-auto max-w-[var(--linear-content-max)] rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,11,15,0.96)_0%,rgba(7,8,11,1)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]',
          variant === 'compact'
            ? 'px-5 py-5 sm:px-6 sm:py-6'
            : 'px-6 py-7 sm:px-8 sm:py-9'
        )}
      >
        <p
          className={cn(
            'text-center text-[12px] font-medium tracking-[0.02em] text-white/48',
            variant === 'compact' ? 'mb-4' : 'mb-5 sm:mb-6'
          )}
        >
          {label}
        </p>
        <div
          className={cn(
            'grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-6 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-10 sm:gap-y-5 lg:flex-nowrap lg:justify-between',
            variant === 'compact' && 'gap-x-5 gap-y-5 sm:gap-x-8'
          )}
        >
          <AwalLogo className='h-[20px] w-auto select-none text-white/92 sm:h-[22px]' />
          <TheOrchardLogo className='h-[28px] w-auto select-none text-white/92 sm:h-[31px]' />
          <UniversalMusicGroupLogo className='h-[14px] w-auto select-none text-white/92 sm:h-[16px]' />
          <ArmadaMusicLogo className='h-[22px] w-auto select-none text-white/92 sm:h-[24px]' />
          <BlackHoleRecordingsLogo className='h-[16px] w-auto sm:h-[18px]' />
          <DiscoWaxLogo className='h-[16px] sm:h-[18px]' />
        </div>
      </div>
    </section>
  );
}
