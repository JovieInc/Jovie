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

export type PlatformPillTone = 'default' | 'faded';

export interface PlatformPillProps {
  platformIcon: string;
  platformName: string;
  primaryText: string;
  secondaryText?: string;
  state?: PlatformPillState;
  tone?: PlatformPillTone;
  badgeText?: string;
  suffix?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  shimmerOnMount?: boolean;
  /** Compact mode shows only icon in a circle */
  compact?: boolean;
  className?: string;
  testId?: string;
}

export const PlatformPill = React.forwardRef<HTMLDivElement, PlatformPillProps>(
  function PlatformPill(
    {
      platformIcon,
      platformName,
      primaryText,
      secondaryText,
      state = 'connected',
      tone = 'default',
      badgeText,
      suffix,
      trailing,
      onClick,
      shimmerOnMount = false,
      compact = false,
      className,
      testId,
    },
    ref
  ) {
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

    const borderColors = React.useMemo(() => {
      if (state === 'ready') {
        const color = hexToRgba('#22c55e', tone === 'faded' ? 0.35 : 0.55);
        return { base: color, hover: hexToRgba('#22c55e', 0.65) };
      }
      if (state === 'error') {
        const color = hexToRgba('#ef4444', tone === 'faded' ? 0.35 : 0.55);
        return { base: color, hover: hexToRgba('#ef4444', 0.65) };
      }

      const baseAlpha = tone === 'faded' ? 0.45 : 0.65;
      const hoverAlpha = tone === 'faded' ? 0.65 : 0.85;
      return {
        base: hexToRgba(brandHex, baseAlpha),
        hover: hexToRgba(brandHex, hoverAlpha),
      };
    }, [brandHex, state, tone]);

    const isTikTok = platformIcon.toLowerCase() === 'tiktok';
    const tikTokGradient = 'linear-gradient(135deg, #25F4EE, #FE2C55)';

    const wrapperStyle: React.CSSProperties = React.useMemo(() => {
      const cssVars: React.CSSProperties = {
        '--pill-border': borderColors.base,
        '--pill-border-hover': borderColors.hover,
        '--pill-bg-hover': hexToRgba(brandHex, 0.08),
      } as React.CSSProperties;

      if (!isTikTok || state === 'ready' || state === 'error') {
        return cssVars;
      }

      const surface = 'var(--color-bg-surface-1, rgba(246, 247, 248, 0.92))';
      return {
        ...cssVars,
        borderColor: 'transparent',
        backgroundImage: `linear-gradient(${surface}, ${surface}), ${tikTokGradient}`,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      };
    }, [
      borderColors.base,
      borderColors.hover,
      brandHex,
      isTikTok,
      state,
      tikTokGradient,
    ]);

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
      // biome-ignore lint/a11y/noStaticElementInteractions: Interactive pill with keyboard support
      // biome-ignore lint/a11y/useAriaPropsSupportedByRole: Dynamic role based on interactivity
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Interactive pill with keyboard support
      <div
        ref={ref}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={isInteractive ? onClick : undefined}
        onKeyDown={handleKeyDown}
        title={
          compact
            ? platformName === primaryText
              ? primaryText
              : `${platformName}: ${primaryText}`
            : undefined
        }
        className={cn(
          'group relative inline-flex items-center rounded-full border text-xs font-medium',
          'border-[var(--pill-border)] hover:border-[var(--pill-border-hover)]',
          'bg-surface-1 dark:bg-surface-1/60 dark:backdrop-blur-sm',
          'text-secondary-token hover:text-primary-token',
          'transition-all duration-200',
          compact
            ? 'size-7 justify-center p-0'
            : 'max-w-full gap-1.5 px-2 py-[3px] min-h-[24px]',
          isInteractive &&
            'hover:bg-[var(--pill-bg-hover)] dark:hover:bg-[var(--pill-bg-hover)]',
          isInteractive
            ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 active:bg-[var(--pill-bg-hover)]'
            : 'cursor-default',
          tone === 'faded' &&
            'bg-surface-1/60 hover:bg-surface-1 text-secondary-token/85 hover:text-primary-token',
          state === 'hidden' && 'opacity-60',
          state === 'loading' && 'animate-pulse motion-reduce:animate-none',
          className
        )}
        style={wrapperStyle}
        data-testid={testId}
        aria-label={
          isInteractive
            ? compact
              ? `${platformName}: ${primaryText}`
              : `Select ${platformName}`
            : undefined
        }
      >
        {showShimmer ? (
          <span
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 animate-shimmer motion-reduce:animate-none opacity-30 dark:opacity-20'
            style={{
              backgroundImage:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
              backgroundSize: '200% 100%',
            }}
          />
        ) : null}

        {compact ? (
          /* Compact mode: icon only, expands on hover */
          <>
            <span
              className='flex items-center justify-center'
              style={{ color: iconFg }}
              aria-hidden='true'
            >
              <SocialIcon platform={platformIcon} className='h-4 w-4' />
            </span>
            {/* Hover expansion: show text */}
            <span className='pointer-events-none absolute left-full ml-2 hidden group-hover:inline-flex items-center gap-1.5 rounded-full border border-[var(--pill-border)] bg-surface-1 dark:bg-surface-1/60 px-2 py-0.5 text-xs font-medium text-secondary-token whitespace-nowrap shadow-lg z-10'>
              <span
                className='flex shrink-0 items-center justify-center rounded-full bg-surface-2/60 p-0.5'
                style={{ ...iconChipStyle }}
              >
                <SocialIcon platform={platformIcon} className='h-3.5 w-3.5' />
              </span>
              {primaryText}
            </span>
          </>
        ) : (
          /* Full mode: icon + text + badges */
          <div className='flex items-center gap-1.5 overflow-hidden flex-1'>
            {/* Active indicator dot */}
            {state === 'connected' && (
              <span
                className='h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400'
                aria-hidden='true'
              />
            )}

            <span
              className='flex shrink-0 items-center justify-center rounded-full bg-surface-2/60 p-0.5 transition-colors'
              style={{ ...iconChipStyle }}
              aria-hidden='true'
            >
              <SocialIcon platform={platformIcon} className='h-3.5 w-3.5' />
            </span>

            <div className='min-w-0 flex-1'>
              <span className={cn(primaryText.length > 40 && 'truncate')}>
                {primaryText}
              </span>
              {hasSecondary ? (
                <span
                  className={cn(
                    'ml-2 text-[10px] text-tertiary-token/80',
                    secondaryText && secondaryText.length > 40 && 'truncate'
                  )}
                >
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
          </div>
        )}

        {!compact && trailing ? (
          <div className='relative ml-1 shrink-0'>{trailing}</div>
        ) : null}
      </div>
    );
  }
);

PlatformPill.displayName = 'PlatformPill';
