import { cn } from '@/lib/utils';
import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  DiscoWaxLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

const LOGO_CLASS = 'select-none text-white';

interface HomeTrustSectionProps {
  readonly variant?: 'default' | 'compact';
  readonly className?: string;
}

export function HomeTrustSection({
  variant = 'default',
  className,
}: Readonly<HomeTrustSectionProps>) {
  return (
    <section
      data-testid='homepage-trust'
      className={cn(
        'homepage-trust-strip',
        variant === 'compact' && 'homepage-trust-strip--compact',
        className
      )}
      aria-label='Trusted by artists on major labels'
    >
      <p
        className={cn(
          'text-center text-[12px] font-medium tracking-[-0.01em] text-tertiary-token',
          variant === 'compact' ? 'mb-3 sm:mb-4' : 'mb-4 sm:mb-5'
        )}
      >
        Trusted by artists on
      </p>
      <div
        className={cn(
          'homepage-trust-logos',
          variant === 'compact' && 'homepage-trust-logos--compact'
        )}
      >
        <AwalLogo className={`${LOGO_CLASS} h-[24px] w-auto`} />
        <TheOrchardLogo className={`${LOGO_CLASS} h-[34px] w-auto`} />
        <UniversalMusicGroupLogo className={`${LOGO_CLASS} h-[16px] w-auto`} />
        <ArmadaMusicLogo className={`${LOGO_CLASS} h-[24px] w-auto`} />
        <BlackHoleRecordingsLogo className={`${LOGO_CLASS} h-[20px] w-auto`} />
        <DiscoWaxLogo className={`${LOGO_CLASS} h-[18px] w-auto`} />
      </div>
    </section>
  );
}
