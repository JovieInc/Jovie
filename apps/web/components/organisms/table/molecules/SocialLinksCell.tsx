'use client';

import React from 'react';
import { CompactLinkRail } from '@/components/molecules/CompactLinkRail';
import {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
} from '@/components/organisms/contact-sidebar/utils';
import { typography } from '../table.styles';

/**
 * Display labels for platforms with special casing requirements
 * These override the generic toTitleCase conversion
 */
const PLATFORM_DISPLAY_LABELS: Record<string, string> = {
  youtube_music: 'YouTube Music',
  youtubemusic: 'YouTube Music',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  apple_music: 'Apple Music',
  amazon_music: 'Amazon Music',
};

/**
 * Convert platform name to display label
 * Uses PLATFORM_DISPLAY_LABELS for special cases, falls back to title case
 * Examples: "instagram" -> "Instagram", "youtube_music" -> "YouTube Music"
 */
function toDisplayLabel(str: string): string {
  const lower = str.toLowerCase();
  if (PLATFORM_DISPLAY_LABELS[lower]) {
    return PLATFORM_DISPLAY_LABELS[lower];
  }
  // Fallback to title case for unknown platforms
  return str
    .split(/[_\s-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

interface SocialLink {
  id: string;
  url: string;
  platform: string;
  platformType: string;
  displayText?: string | null;
}

interface SocialLinksCellProps {
  /**
   * Social links to display
   */
  readonly links: SocialLink[] | null;

  /**
   * Maximum number of links to show
   * @default 3
   */
  readonly maxLinks?: number;

  /**
   * Filter to show only specific platform types
   * @example 'music_streaming' | 'social_media'
   */
  readonly filterPlatformType?: string | string[];

  /**
   * Additional CSS classes
   */
  readonly className?: string;
}

/**
 * SocialLinksCell - Display social media links as pills
 *
 * Memoized for performance in virtualized tables to prevent unnecessary re-renders.
 *
 * Features:
 * - Platform-branded pills with usernames
 * - Click to open in new tab
 * - Limit display to N links (default 3)
 * - Empty state with dash
 * - Overflow handling
 *
 * Example:
 * ```tsx
 * <SocialLinksCell
 *   links={profile.socialLinks}
 *   maxLinks={3}
 * />
 * ```
 */
export const SocialLinksCell = React.memo(function SocialLinksCell({
  links,
  maxLinks = 3,
  filterPlatformType,
  className,
}: SocialLinksCellProps) {
  if (!links || links.length === 0) {
    return <span className={typography.cellTertiary}>—</span>;
  }

  // Filter by platform category if specified
  let filteredLinks = links;
  if (filterPlatformType) {
    const types = Array.isArray(filterPlatformType)
      ? filterPlatformType.map(t => t.toLowerCase())
      : [filterPlatformType.toLowerCase()];
    filteredLinks = links.filter(link => {
      const platformTypeLower = link.platformType.toLowerCase();
      // Match against the platform category (social, music, etc.)
      return types.includes(platformTypeLower);
    });
  }

  if (filteredLinks.length === 0) {
    return <span className={typography.cellTertiary}>—</span>;
  }

  // Use collapsed mode (circles) when there are 2+ links
  const useCollapsedMode = filteredLinks.length >= 2;
  const visibleLinks = filteredLinks.slice(0, maxLinks);

  return (
    <CompactLinkRail
      items={visibleLinks.map(link => {
        const username =
          extractUsernameFromUrl(link.url) ??
          extractUsernameFromLabel(link.displayText ?? '') ??
          link.displayText ??
          '';
        const displayUsername = formatUsername(username);

        const platformLower = link.platform.toLowerCase();
        const isGenericType =
          platformLower === 'music_streaming' ||
          platformLower === 'social_media';

        const platformIcon = isGenericType
          ? link.platformType.toLowerCase()
          : platformLower;
        const platformName = isGenericType
          ? toDisplayLabel(link.platformType)
          : toDisplayLabel(link.platform);

        const isMusicPlatform = [
          'spotify',
          'apple_music',
          'soundcloud',
          'tidal',
        ].includes(platformIcon);

        const primaryText =
          isMusicPlatform && link.displayText
            ? link.displayText
            : displayUsername || platformName;

        return {
          id: link.id,
          platformIcon,
          platformName,
          primaryText,
          onClick: () => {
            globalThis.open(link.url, '_blank', 'noopener,noreferrer');
          },
        };
      })}
      countLabel='social links'
      maxVisible={maxLinks}
      className={className}
      railClassName={useCollapsedMode ? undefined : 'gap-1'}
    />
  );
});
