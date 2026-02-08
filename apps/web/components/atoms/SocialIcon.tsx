'use client';

import { memo, useEffect, useState } from 'react';
import type { SimpleIcon } from 'simple-icons';

interface SocialIconProps {
  readonly platform: string;
  readonly className?: string;
  readonly size?: number;
  readonly 'aria-hidden'?: boolean;
  readonly 'aria-label'?: string;
}

// Lazy loader map - only loads icons on demand via dynamic imports
const iconLoaders: Record<string, () => Promise<{ default: SimpleIcon }>> = {
  instagram: () =>
    import('simple-icons').then(m => ({ default: m.siInstagram })),
  twitter: () => import('simple-icons').then(m => ({ default: m.siX })),
  x: () => import('simple-icons').then(m => ({ default: m.siX })),
  tiktok: () => import('simple-icons').then(m => ({ default: m.siTiktok })),
  youtube: () => import('simple-icons').then(m => ({ default: m.siYoutube })),
  youtube_music: () =>
    import('simple-icons').then(m => ({ default: m.siYoutubemusic })),
  youtubemusic: () =>
    import('simple-icons').then(m => ({ default: m.siYoutubemusic })),
  facebook: () => import('simple-icons').then(m => ({ default: m.siFacebook })),
  spotify: () => import('simple-icons').then(m => ({ default: m.siSpotify })),
  apple: () => import('simple-icons').then(m => ({ default: m.siApplemusic })),
  applemusic: () =>
    import('simple-icons').then(m => ({ default: m.siApplemusic })),
  apple_music: () =>
    import('simple-icons').then(m => ({ default: m.siApplemusic })),
  soundcloud: () =>
    import('simple-icons').then(m => ({ default: m.siSoundcloud })),
  bandcamp: () => import('simple-icons').then(m => ({ default: m.siBandcamp })),
  discord: () => import('simple-icons').then(m => ({ default: m.siDiscord })),
  reddit: () => import('simple-icons').then(m => ({ default: m.siReddit })),
  pinterest: () =>
    import('simple-icons').then(m => ({ default: m.siPinterest })),
  tumblr: () => import('simple-icons').then(m => ({ default: m.siTumblr })),
  vimeo: () => import('simple-icons').then(m => ({ default: m.siVimeo })),
  github: () => import('simple-icons').then(m => ({ default: m.siGithub })),
  medium: () => import('simple-icons').then(m => ({ default: m.siMedium })),
  patreon: () => import('simple-icons').then(m => ({ default: m.siPatreon })),
  venmo: () => import('simple-icons').then(m => ({ default: m.siVenmo })),
  website: () =>
    import('simple-icons').then(m => ({ default: m.siGooglechrome })),
  telegram: () => import('simple-icons').then(m => ({ default: m.siTelegram })),
  snapchat: () => import('simple-icons').then(m => ({ default: m.siSnapchat })),
  onlyfans: () => import('simple-icons').then(m => ({ default: m.siOnlyfans })),
  quora: () => import('simple-icons').then(m => ({ default: m.siQuora })),
  threads: () => import('simple-icons').then(m => ({ default: m.siThreads })),
  line: () => import('simple-icons').then(m => ({ default: m.siLine })),
  viber: () => import('simple-icons').then(m => ({ default: m.siViber })),
  rumble: () => import('simple-icons').then(m => ({ default: m.siRumble })),
  twitch: () => import('simple-icons').then(m => ({ default: m.siTwitch })),
  tidal: () => import('simple-icons').then(m => ({ default: m.siTidal })),
};

// Icon metadata map for synchronous access to hex colors
const iconMetadata: Record<string, { hex: string }> = {
  instagram: { hex: 'E4405F' },
  twitter: { hex: '000000' },
  x: { hex: '000000' },
  tiktok: { hex: '000000' },
  youtube: { hex: 'FF0000' },
  youtube_music: { hex: 'FF0000' },
  youtubemusic: { hex: 'FF0000' },
  facebook: { hex: '0866FF' },
  spotify: { hex: '1DB954' },
  apple: { hex: 'FA243C' },
  applemusic: { hex: 'FA243C' },
  apple_music: { hex: 'FA243C' },
  soundcloud: { hex: 'FF3300' },
  bandcamp: { hex: '1DA0C3' },
  discord: { hex: '5865F2' },
  reddit: { hex: 'FF4500' },
  pinterest: { hex: 'E60023' },
  tumblr: { hex: '36465D' },
  vimeo: { hex: '1AB7EA' },
  github: { hex: '181717' },
  medium: { hex: '000000' },
  patreon: { hex: 'FF424D' },
  venmo: { hex: '008CFF' },
  website: { hex: '4285F4' },
  telegram: { hex: '26A5E4' },
  snapchat: { hex: 'FFFC00' },
  onlyfans: { hex: '00AFF0' },
  quora: { hex: 'B92B27' },
  threads: { hex: '000000' },
  line: { hex: '00B900' },
  viber: { hex: '7360F2' },
  rumble: { hex: '85C742' },
  twitch: { hex: '9146FF' },
  tidal: { hex: '000000' },
};

/**
 * Get platform icon metadata synchronously (for colors, etc.)
 * Use this when you only need the hex color and don't need the full icon
 */
export function getPlatformIconMetadata(
  platform: string
): { hex: string } | undefined {
  return iconMetadata[platform.toLowerCase()];
}

export async function getPlatformIcon(
  platform: string
): Promise<SimpleIcon | undefined> {
  const loader = iconLoaders[platform.toLowerCase()];
  if (!loader) return undefined;

  try {
    const iconModule = await loader();
    return iconModule.default;
  } catch {
    return undefined;
  }
}

function SocialIconInner({
  platform,
  className,
  size,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: Readonly<SocialIconProps>) {
  const [iconPath, setIconPath] = useState<string | null>(null);
  const iconClass = className || 'h-4 w-4';
  const sizeStyle = size ? { width: size, height: size } : undefined;

  useEffect(() => {
    const loader = iconLoaders[platform.toLowerCase()];
    if (loader) {
      loader()
        .then(iconModule => {
          setIconPath(iconModule.default.path);
        })
        .catch(() => {
          setIconPath(null);
        });
    }
  }, [platform]);

  if (!iconPath) {
    // Fallback while loading or for unknown platforms
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
    // SVG requires role="img" for accessibility; native <img> cannot render inline SVGs
    <svg // NOSONAR S6819
      className={iconClass}
      style={sizeStyle}
      fill='currentColor'
      viewBox='0 0 24 24'
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      <path d={iconPath} />
    </svg>
  );
}

export const SocialIcon = memo(SocialIconInner);
