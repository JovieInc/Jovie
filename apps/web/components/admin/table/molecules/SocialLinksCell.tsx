'use client';

import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
} from '@/components/organisms/contact-sidebar/utils';
import { typography } from '../table.styles';

/**
 * Convert platform name to title case
 * Examples: "instagram" -> "Instagram", "apple_music" -> "Apple Music"
 */
function toTitleCase(str: string): string {
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
   * Additional CSS classes
   */
  className?: string;
}

/**
 * SocialLinksCell - Display social media links as pills
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
export function SocialLinksCell({
  links,
  maxLinks = 3,
  className,
}: SocialLinksCellProps) {
  if (!links || links.length === 0) {
    return <span className={typography.cellTertiary}>—</span>;
  }

  // Use compact mode (circles) when there are 2+ links
  const useCompactMode = links.length >= 2;

  return (
    <div className='flex gap-1.5 overflow-hidden'>
      {links.slice(0, maxLinks).map(link => {
        const username =
          extractUsernameFromUrl(link.url) ??
          extractUsernameFromLabel(link.displayText ?? '') ??
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
          ? toTitleCase(link.platformType)
          : toTitleCase(link.platform);

        // For Spotify (and other music platforms), use displayText if available (contains artist name)
        // Otherwise fall back to username or platform name
        const isSpotify = platformIcon === 'spotify';
        const primaryText =
          isSpotify && link.displayText
            ? link.displayText
            : displayUsername || platformName;

        return (
          <PlatformPill
            key={link.id}
            platformIcon={platformIcon}
            platformName={platformName}
            primaryText={primaryText}
            compact={useCompactMode}
            onClick={() => {
              window.open(link.url, '_blank', 'noopener,noreferrer');
            }}
            className='shrink-0'
          />
        );
      })}
    </div>
  );
}
