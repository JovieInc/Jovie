'use client';

import React from 'react';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
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
  links: SocialLink[] | null;

  /**
   * Maximum number of links to show
   * @default 3
   */
  maxLinks?: number;

  /**
   * Filter to show only specific platform types
   * @example 'music_streaming' | 'social_media'
   */
  filterPlatformType?: string | string[];

  /**
   * Additional CSS classes
   */
  className?: string;
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
      const platformLower = link.platform.toLowerCase();
      // Match against the platform category (social_media, music_streaming, etc.)
      return types.includes(platformLower);
    });
  }

  if (filteredLinks.length === 0) {
    return <span className={typography.cellTertiary}>—</span>;
  }

  // Use collapsed mode (circles) when there are 2+ links
  const useCollapsedMode = filteredLinks.length >= 2;
  const visibleLinks = filteredLinks.slice(0, maxLinks);

  return (
    <div className='flex items-center overflow-hidden'>
      {visibleLinks.map((link, index) => {
        const isLast = index === visibleLinks.length - 1;
        const username =
          extractUsernameFromUrl(link.url) ??
          extractUsernameFromLabel(link.displayText ?? '') ??
          link.displayText ?? // Add fallback to raw displayText
          '';
        const displayUsername = formatUsername(username);

        // Handle generic platform types like "music_streaming" by using platformType instead
        const platformLower = link.platform.toLowerCase();
        const isGenericType =
          platformLower === 'music_streaming' ||
          platformLower === 'social_media';

        // Use platformType if platform is generic, otherwise use platform
        const platformIcon = isGenericType
          ? link.platformType.toLowerCase()
          : platformLower;
        const platformName = isGenericType
          ? toDisplayLabel(link.platformType)
          : toDisplayLabel(link.platform);

        // Distinguish between music platforms (show artist name) and social platforms (show username)
        const isMusicPlatform = [
          'spotify',
          'apple_music',
          'soundcloud',
          'tidal',
        ].includes(platformIcon);

        const primaryText =
          isMusicPlatform && link.displayText
            ? link.displayText // Artist name for music platforms
            : displayUsername || platformName; // Username for social platforms

        return (
          <PlatformPill
            key={link.id}
            platformIcon={platformIcon}
            platformName={platformName}
            primaryText={primaryText}
            collapsed={useCollapsedMode}
            stackable={useCollapsedMode}
            defaultExpanded={isLast && useCollapsedMode}
            onClick={() => {
              globalThis.open(link.url, '_blank', 'noopener,noreferrer');
            }}
          />
        );
      })}
    </div>
  );
});
