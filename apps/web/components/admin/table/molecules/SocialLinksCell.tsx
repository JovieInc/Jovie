'use client';

import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
} from '@/components/organisms/contact-sidebar/utils';
import { typography } from '../table.styles';

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

  return (
    <div className='flex gap-1.5 overflow-hidden'>
      {links.slice(0, maxLinks).map(link => {
        const username =
          extractUsernameFromUrl(link.url) ??
          extractUsernameFromLabel(link.displayText ?? '') ??
          '';
        const displayUsername = formatUsername(username);

        // Use lowercase platform for icon matching (spotify, instagram, etc.)
        const platformIcon = link.platform.toLowerCase();

        return (
          <PlatformPill
            key={link.id}
            platformIcon={platformIcon}
            platformName={link.platform}
            primaryText={displayUsername || link.platform}
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
