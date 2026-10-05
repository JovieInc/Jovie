'use client';

import { memo } from 'react';

import {
  normalizeSocialIconKey,
  SOCIAL_ICON_DATA,
} from '@/lib/social-icons/icon-data';

interface SocialIconProps {
  readonly platform: string;
  readonly className?: string;
  readonly size?: number;
  readonly 'aria-hidden'?: boolean;
  readonly 'aria-label'?: string;
}

/**
 * Get platform icon metadata synchronously (for colors, etc.)
 * Use this when you only need the hex color and don't need the full icon
 */
export function getPlatformIconMetadata(
  platform: string
): { hex: string } | undefined {
  const entry = SOCIAL_ICON_DATA[normalizeSocialIconKey(platform)];
  return entry ? { hex: entry.hex } : undefined;
}

export async function getPlatformIcon(
  platform: string
): Promise<{ path: string; hex: string; slug: string } | undefined> {
  const slug = normalizeSocialIconKey(platform);
  const entry = SOCIAL_ICON_DATA[slug];
  if (!entry) return undefined;
  return { path: entry.path, hex: entry.hex, slug };
}

function SocialIconInner({
  platform,
  className,
  size,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: Readonly<SocialIconProps>) {
  const iconClass = className || 'h-4 w-4';
  const sizeStyle = size ? { width: size, height: size } : undefined;
  const entry = SOCIAL_ICON_DATA[normalizeSocialIconKey(platform)];

  if (!entry) {
    // Fallback for unknown platforms
    return (
      <svg
        className={iconClass}
        style={sizeStyle}
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
        aria-hidden='true'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
        />
      </svg>
    );
  }

  return (
    <svg
      className={iconClass}
      style={sizeStyle}
      fill='currentColor'
      viewBox='0 0 24 24'
      role={ariaHidden ? undefined : 'img'}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
    >
      <path d={entry.path} />
    </svg>
  );
}

export const SocialIcon = memo(SocialIconInner);
