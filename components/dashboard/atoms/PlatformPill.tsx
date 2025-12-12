'use client';

import * as React from 'react';
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import { hexToRgba, isBrandDark } from '@/lib/utils/color';

export type PlatformPillState =
  | 'connected'
  | 'ready'
  | 'error'
  | 'hidden'
  | 'loading';

export interface PlatformPillProps {
  platformIcon: string;
  platformName: string;
  primaryText: string;
  secondaryText?: string;
  state?: PlatformPillState;
  badgeText?: string;
  suffix?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  shimmerOnMount?: boolean;
  className?: string;
  testId?: string;
}

export function PlatformPill({
  platformIcon,
  platformName,
  primaryText,
  secondaryText,
  state = 'connected',
  badgeText,
  suffix,
  trailing,
  onClick,
  shimmerOnMount = false,
  className,
  testId,
}: PlatformPillProps) {
  const isInteractive = Boolean(onClick);

  const [showShimmer, setShowShimmer] = React.useState<boolean>(false);
  const hasShimmeredRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (!shimmerOnMount) return;
    if (hasShimmeredRef.current) return;
    hasShimmeredRef.current = true;

    setShowShimmer(true);
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      setShowShimmer(false);
    }, 900);

    return () => clearTimeout(timeoutId);
  }, [shimmerOnMount]);

  const iconMeta = React.useMemo(
    () => getPlatformIcon(platformIcon),
    [platformIcon]
  );

  const brandHex = React.useMemo(
    () => (iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280'),
    [iconMeta]
  );

  const borderColor = React.useMemo(() => {
    if (state === 'ready') return hexToRgba('#22c55e', 0.55);
    if (state === 'error') return hexToRgba('#ef4444', 0.55);

    const isTooDark = isBrandDark(brandHex);
    const base = isTooDark ? '#9ca3af' : brandHex;
    return hexToRgba(base, 0.55);
  }, [brandHex, state]);

  const isTikTok = platformIcon.toLowerCase() === 'tiktok';
  const tikTokGradient = 'linear-gradient(135deg, #25F4EE, #FE2C55)';

  const wrapperStyle: React.CSSProperties = React.useMemo(() => {
    if (!isTikTok || state === 'ready' || state === 'error') {
      return { borderColor };
    }

    const surface = 'var(--surface-1, rgba(17, 17, 17, 0.92))';
    return {
      borderColor: 'transparent',
      backgroundImage: `linear-gradient(${surface}, ${surface}), ${tikTokGradient}`,
      backgroundOrigin: 'border-box',
      backgroundClip: 'padding-box, border-box',
    };
  }, [borderColor, isTikTok, state, tikTokGradient]);

  const iconFg = React.useMemo(() => {
    if (state === 'loading') return '#6b7280';
    const isTooDark = isBrandDark(brandHex);
    return isTooDark ? '#9ca3af' : brandHex;
  }, [brandHex, state]);

  const iconChipStyle: React.CSSProperties | undefined = React.useMemo(() => {
    if (!isTikTok || state === 'loading') {
      return { color: iconFg };
    }

    return {
      backgroundImage: tikTokGradient,
      color: '#ffffff',
    };
  }, [iconFg, isTikTok, state, tikTokGradient]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isInteractive) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick?.();
      }
    },
    [isInteractive, onClick]
  );

  const hasSecondary = Boolean(
    secondaryText && secondaryText.trim().length > 0
  );

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1 text-xs font-medium text-tertiary-token',
        'bg-surface-1/60 backdrop-blur-sm',
        'transform-gpu transition-all hover:bg-surface-2/60 hover:text-secondary-token hover:-translate-y-px hover:shadow-sm hover:shadow-black/10 dark:hover:shadow-black/40',
        isInteractive
          ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 active:scale-[0.98]'
          : 'cursor-default',
        state === 'hidden' && 'opacity-60',
        state === 'loading' && 'animate-pulse',
        className
      )}
      style={wrapperStyle}
      data-testid={testId}
      aria-label={isInteractive ? `Select ${platformName}` : undefined}
    >
      {showShimmer ? (
        <span
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 animate-shimmer opacity-30 dark:opacity-20'
          style={{
            backgroundImage:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
            backgroundSize: '200% 100%',
          }}
        />
      ) : null}

      <span
        className='flex shrink-0 items-center justify-center rounded-full bg-surface-2/60 p-0.5 transition-colors'
        style={{ ...iconChipStyle, borderColor }}
        aria-hidden='true'
      >
        <SocialIcon platform={platformIcon} className='h-3.5 w-3.5' />
      </span>

      <div className='min-w-0 max-w-[180px] truncate sm:max-w-[240px]'>
        <span className='truncate'>{primaryText}</span>
        {hasSecondary ? (
          <span className='ml-2 truncate text-[10px] text-tertiary-token/80'>
            {secondaryText}
          </span>
        ) : null}
      </div>

      {badgeText ? (
        <span className='shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-secondary-token ring-1 ring-subtle'>
          {badgeText}
        </span>
      ) : null}

      {suffix ? (
        <span className='ml-0.5 shrink-0 text-[10px]' aria-hidden='true'>
          {suffix}
        </span>
      ) : null}

      {trailing ? (
        <div className='relative ml-1 shrink-0'>{trailing}</div>
      ) : null}
    </div>
  );
}
