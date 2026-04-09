import Image from 'next/image';
import { cn } from '@/lib/utils';

export type MarketingSurfaceVariant = 'floating' | 'panel' | 'phone-inset';
export type MarketingGlowTone = 'violet' | 'blue' | 'amber' | 'none';
export type MarketingSurfaceChrome = 'framed' | 'full-bleed';

export interface MarketingSurfaceCardProps {
  readonly src?: string;
  readonly alt?: string;
  readonly aspectRatio?: string;
  readonly objectPosition?: string;
  readonly variant?: MarketingSurfaceVariant;
  readonly glowTone?: MarketingGlowTone;
  readonly priority?: boolean;
  readonly testId?: string;
  readonly chrome?: MarketingSurfaceChrome;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly children?: React.ReactNode;
}

const VARIANT_CLASS_NAMES: Record<MarketingSurfaceVariant, string> = {
  floating:
    'rounded-[1.55rem] border-white/12 bg-[linear-gradient(180deg,rgba(19,21,29,0.98),rgba(12,13,20,0.94))] shadow-[0_36px_110px_rgba(0,0,0,0.48),0_12px_32px_rgba(0,0,0,0.28)]',
  panel:
    'rounded-[1.5rem] border-white/10 bg-[linear-gradient(180deg,rgba(18,20,27,0.96),rgba(11,13,18,0.94))] shadow-[0_28px_90px_rgba(0,0,0,0.38),0_8px_24px_rgba(0,0,0,0.24)]',
  'phone-inset':
    'rounded-[2rem] border-white/14 bg-[linear-gradient(180deg,rgba(17,18,24,0.98),rgba(9,10,15,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.48),0_10px_30px_rgba(0,0,0,0.28)]',
};

const GLOW_CLASS_NAMES: Record<MarketingGlowTone, string> = {
  violet:
    'bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.24),transparent_58%)]',
  blue: 'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_58%)]',
  amber:
    'bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_58%)]',
  none: '',
};

export function MarketingSurfaceCard({
  src,
  alt,
  aspectRatio,
  objectPosition = 'center top',
  variant = 'panel',
  glowTone = 'violet',
  priority = false,
  testId,
  chrome,
  className,
  imageClassName,
  children,
}: Readonly<MarketingSurfaceCardProps>) {
  const resolvedChrome = chrome ?? (src ? 'full-bleed' : 'framed');

  return (
    <div
      data-testid={testId}
      className={cn(
        'relative overflow-hidden',
        resolvedChrome === 'framed' && 'border backdrop-blur-sm',
        VARIANT_CLASS_NAMES[variant],
        className
      )}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      <div
        aria-hidden='true'
        className={cn(
          'pointer-events-none absolute inset-0',
          GLOW_CLASS_NAMES[glowTone]
        )}
      />
      {resolvedChrome === 'framed' ? (
        <>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]'
          />
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-[1px] rounded-[inherit] border border-white/6'
          />
        </>
      ) : null}

      {src ? (
        <Image
          src={src}
          alt={alt ?? ''}
          fill
          priority={priority}
          sizes='(max-width: 1024px) 100vw, 900px'
          className={cn('object-cover', imageClassName)}
          style={{ objectPosition }}
        />
      ) : null}

      {children ? (
        <div className='relative z-20 h-full w-full'>{children}</div>
      ) : null}

      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_24%,transparent_74%,rgba(0,0,0,0.18))]'
      />
    </div>
  );
}
