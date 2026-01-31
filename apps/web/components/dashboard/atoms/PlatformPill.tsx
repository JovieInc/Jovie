'use client';

import * as React from 'react';
import { getPlatformIconMetadata } from '@/components/atoms/SocialIcon';
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
  readonly platformIcon: string;
  readonly platformName: string;
  readonly primaryText: string;
  readonly secondaryText?: string;
  readonly state?: PlatformPillState;
  readonly tone?: PlatformPillTone;
  readonly badgeText?: string;
  readonly suffix?: React.ReactNode;
  readonly trailing?: React.ReactNode;
  readonly onClick?: () => void;
  readonly shimmerOnMount?: boolean;
  /** Collapsed mode shows only icon, expands on hover to show text */
  readonly collapsed?: boolean;
  /** @deprecated Use collapsed instead */
  readonly compact?: boolean;
  /** Enable avatar-style stacking with negative margin overlap */
  readonly stackable?: boolean;
  /** When stacked, expand this pill by default (for highest z-index item) */
  readonly defaultExpanded?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

export const PlatformPill = React.forwardRef<
  HTMLButtonElement,
  PlatformPillProps
>(function PlatformPill(
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
    () => getPlatformIconMetadata(platformIcon),
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

  const ariaLabel = !isInteractive
    ? undefined
    : collapsed
      ? `${platformName}: ${primaryText}`
      : `Select ${platformName}`;

  return (
    <button
      ref={ref}
      type='button'
      onClick={onClick}
      title={getPillTitle(collapsed, platformName, primaryText)}
      className={`${pillClassName} disabled:opacity-100 disabled:cursor-default`}
      style={wrapperStyle}
      data-testid={testId}
      aria-label={ariaLabel}
      disabled={!isInteractive}
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
    </button>
  );
});

PlatformPill.displayName = 'PlatformPill';
