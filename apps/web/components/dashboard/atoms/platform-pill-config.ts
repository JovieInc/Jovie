import type { CSSProperties } from 'react';
import { hexToRgba, isBrandDark } from '@/lib/utils/color';
import type { PlatformPillState, PlatformPillTone } from './PlatformPill';

/**
 * State color configuration
 */
const STATE_COLORS = {
  ready: '#22c55e',
  error: '#ef4444',
  loading: '#6b7280',
} as const;

/**
 * Alpha values for tone variants
 */
const ALPHA_VALUES = {
  faded: {
    base: 0.45,
    hover: 0.65,
    stateBorder: 0.35,
  },
  default: {
    base: 0.65,
    hover: 0.85,
    stateBorder: 0.55,
  },
} as const;

/**
 * TikTok special gradient configuration
 */
export const TIKTOK_CONFIG = {
  gradient: 'linear-gradient(135deg, #25F4EE, #FE2C55)',
  textColor: '#ffffff',
} as const;

/**
 * Border color configuration for different states
 */
export interface BorderColors {
  base: string;
  hover: string;
}

/**
 * Calculate border colors based on state, tone, and brand color
 */
export function getBorderColors(
  state: PlatformPillState,
  tone: PlatformPillTone,
  brandHex: string
): BorderColors {
  // Special states (ready, error) use fixed colors
  if (state === 'ready') {
    const alpha = ALPHA_VALUES[tone].stateBorder;
    return {
      base: hexToRgba(STATE_COLORS.ready, alpha),
      hover: hexToRgba(STATE_COLORS.ready, 0.65),
    };
  }

  if (state === 'error') {
    const alpha = ALPHA_VALUES[tone].stateBorder;
    return {
      base: hexToRgba(STATE_COLORS.error, alpha),
      hover: hexToRgba(STATE_COLORS.error, 0.65),
    };
  }

  // Default: use brand color with tone-specific alpha
  const { base: baseAlpha, hover: hoverAlpha } = ALPHA_VALUES[tone];
  return {
    base: hexToRgba(brandHex, baseAlpha),
    hover: hexToRgba(brandHex, hoverAlpha),
  };
}

/**
 * Calculate wrapper styles for the pill
 */
export function getWrapperStyle(
  borderColors: BorderColors,
  brandHex: string,
  isTikTok: boolean,
  state: PlatformPillState
): CSSProperties {
  const cssVars: CSSProperties = {
    '--pill-border': borderColors.base,
    '--pill-border-hover': borderColors.hover,
    '--pill-bg-hover': hexToRgba(brandHex, 0.08),
  } as CSSProperties;

  // TikTok gets gradient border (unless in special state)
  if (isTikTok && state !== 'ready' && state !== 'error') {
    const surface = 'var(--color-bg-surface-1, rgba(246, 247, 248, 0.92))';
    return {
      ...cssVars,
      borderColor: 'transparent',
      backgroundImage: `linear-gradient(${surface}, ${surface}), ${TIKTOK_CONFIG.gradient}`,
      backgroundOrigin: 'border-box',
      backgroundClip: 'padding-box, border-box',
    };
  }

  return cssVars;
}

/**
 * Calculate icon foreground color based on brand and state
 */
export function getIconForegroundColor(
  brandHex: string,
  state: PlatformPillState
): string {
  if (state === 'loading') {
    return STATE_COLORS.loading;
  }

  const isTooDark = isBrandDark(brandHex);
  return isTooDark ? '#9ca3af' : brandHex;
}

/**
 * Calculate icon chip styling (handles TikTok gradient)
 */
export function getIconChipStyle(
  iconFg: string,
  isTikTok: boolean,
  state: PlatformPillState
): CSSProperties | undefined {
  if (!isTikTok || state === 'loading') {
    return { color: iconFg };
  }

  return {
    backgroundImage: TIKTOK_CONFIG.gradient,
    color: TIKTOK_CONFIG.textColor,
  };
}
