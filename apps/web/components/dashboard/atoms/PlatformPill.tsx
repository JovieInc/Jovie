'use client';

import * as React from 'react';
import { getPlatformIcon } from '@/components/atoms/SocialIcon';
import {
  CollapsedContent,
  ExpandedContent,
  PillIcon,
  PillShimmer,
  TrailingContent,
} from './PlatformPill.parts';
import { getPillClassNames, getPillTitle } from './PlatformPill.utils';
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

    // Compute class names and a11y props using extracted utilities
    const pillClassName = getPillClassNames({
      collapsed,
      defaultExpanded,
      stackable,
      isInteractive,
      tone,
      state,
      className,
    });

    function getAriaLabel(): string | undefined {
      if (!isInteractive) return undefined;
      if (collapsed) return `${platformName}: ${primaryText}`;
      return `Select ${platformName}`;
    }
    const ariaLabel = getAriaLabel();

    return (
      // NOSONAR S6819: Dynamic role for conditional interactivity; native <button> can't contain complex pill layout
      <div
        ref={ref}
        onClick={isInteractive ? onClick : undefined}
        onKeyDown={handleKeyDown}
        title={getPillTitle(collapsed, platformName, primaryText)}
        className={pillClassName}
        style={wrapperStyle}
        data-testid={testId}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-label={ariaLabel}
      >
        <PillShimmer show={showShimmer} />
        <PillIcon platformIcon={platformIcon} style={iconChipStyle} />

        {collapsed ? (
          <CollapsedContent
            defaultExpanded={defaultExpanded}
            primaryText={primaryText}
          />
        ) : (
          <ExpandedContent
            primaryText={primaryText}
            secondaryText={secondaryText}
            badgeText={badgeText}
            suffix={suffix}
          />
        )}

        <TrailingContent collapsed={collapsed}>{trailing}</TrailingContent>
      </div>
    );
  }
);

PlatformPill.displayName = 'PlatformPill';
