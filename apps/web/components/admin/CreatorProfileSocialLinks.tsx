import { memo, useCallback } from 'react';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
} from '@/components/organisms/contact-sidebar/utils';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

export interface CreatorProfileSocialLinksProps {
  socialLinks: AdminCreatorProfileRow['socialLinks'];
}

export const CreatorProfileSocialLinks = memo(
  function CreatorProfileSocialLinks({
    socialLinks,
  }: CreatorProfileSocialLinksProps) {
    const handleOpenLink = useCallback((url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    if (!socialLinks || socialLinks.length === 0) {
      return <span className='text-xs text-tertiary-token'>—</span>;
    }

    return (
      <>
        {socialLinks.slice(0, 3).map(link => {
          const username =
            extractUsernameFromUrl(link.url) ??
            extractUsernameFromLabel(link.displayText ?? '') ??
            '';
          const displayUsername = formatUsername(username);

          return (
            <PlatformPill
              key={link.id}
              platformIcon={link.platformType}
              platformName={link.platform}
              primaryText={displayUsername || link.platformType}
              onClick={() => handleOpenLink(link.url)}
              className='shrink-0'
            />
          );
        })}
      </>
    );
  }
);
