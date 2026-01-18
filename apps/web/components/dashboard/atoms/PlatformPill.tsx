'use client';

import * as React from 'react';
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import {
  getBorderColors,
  getIconChipStyle,
  getIconForegroundColor,
  getWrapperStyle,
} from './platform-pill-config';

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
  /** Collapsed mode shows only icon, expands on hover to show text */
  collapsed?: boolean;
  /** @deprecated Use collapsed instead */
  compact?: boolean;
  /** Enable avatar-style stacking with negative margin overlap */
  stackable?: boolean;
  /** When stacked, expand this pill by default (for highest z-index item) */
  defaultExpanded?: boolean;
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
      collapsed: collapsedProp,
      compact: compactProp,
      stackable = false,
      defaultExpanded = false,
      className,
      testId,
    },
    ref
  ) {
    // Support both collapsed and compact (backwards compatibility)
    const collapsed = collapsedProp ?? compactProp ?? false;
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

    const isTikTok = platformIcon.toLowerCase() === 'tiktok';

    // Use config-based styling functions
    const borderColors = React.useMemo(
      () => getBorderColors(state, tone, brandHex),
      [state, tone, brandHex]
    );

    const wrapperStyle = React.useMemo(
      () => getWrapperStyle(borderColors, brandHex, isTikTok, state),
      [borderColors, brandHex, isTikTok, state]
    );

    const iconFg = React.useMemo(
      () => getIconForegroundColor(brandHex, state),
      [brandHex, state]
    );

    const iconChipStyle = React.useMemo(
      () => getIconChipStyle(iconFg, isTikTok, state),
      [iconFg, isTikTok, state]
    );

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
          collapsed
            ? platformName === primaryText
              ? primaryText
              : `${platformName}: ${primaryText}`
            : undefined
        }
        className={cn(
          'group/pill relative inline-flex items-center rounded-full border text-xs font-medium',
          'border-(--pill-border) hover:border-(--pill-border-hover)',
          'bg-surface-1 dark:bg-surface-1/60 dark:backdrop-blur-sm',
          'text-secondary-token hover:text-primary-token',
          'transition-all duration-200',
          // Collapsed: starts as icon circle, expands on hover
          collapsed && 'h-7 justify-center px-2',
          collapsed && !defaultExpanded && 'w-7 p-0',
          collapsed && defaultExpanded && 'w-auto gap-1',
          // Expanded: full width with padding
          !collapsed && 'max-w-full gap-1.5 px-2 py-[3px] min-h-[24px]',
          // Stackable: negative margin for avatar-style overlap, last item has higher z-index
          stackable && '-ml-2 first:ml-0',
          stackable && 'last:z-10',
          // Hover brings pill to front when stacked
          stackable && 'hover:z-20',
          isInteractive &&
            'hover:bg-(--pill-bg-hover) dark:hover:bg-(--pill-bg-hover)',
          isInteractive
            ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 active:bg-(--pill-bg-hover)'
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
            ? collapsed
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

        {/* Icon - always visible */}
        <span
          className='flex shrink-0 items-center justify-center rounded-full bg-surface-2/60 p-0.5 transition-colors'
          style={{ ...iconChipStyle }}
          aria-hidden='true'
        >
          <SocialIcon platform={platformIcon} className='h-3.5 w-3.5' />
        </span>

        {/* Content - visible in expanded mode, or on hover/defaultExpanded in collapsed mode */}
        {collapsed ? (
          // Collapsed mode: text hidden unless defaultExpanded or on hover
          <span
            className={cn(
              'whitespace-nowrap overflow-hidden transition-all duration-200',
              !defaultExpanded &&
                'w-0 opacity-0 group-hover/pill:w-auto group-hover/pill:opacity-100',
              defaultExpanded && 'w-auto opacity-100'
            )}
          >
            {primaryText}
          </span>
        ) : (
          // Expanded mode: full layout with all features
          <div className='flex items-center gap-1.5 overflow-hidden flex-1 min-w-0'>
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

        {trailing && !collapsed ? (
          <div className='relative ml-1 shrink-0'>{trailing}</div>
        ) : null}
      </div>
    );
  }
);

PlatformPill.displayName = 'PlatformPill';
