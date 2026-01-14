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

export function CreatorProfileSocialLinks({
  socialLinks,
}: CreatorProfileSocialLinksProps) {
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
            onClick={() => {
              window.open(link.url, '_blank', 'noopener,noreferrer');
            }}
            className='shrink-0'
          />
        );
      })}
    </>
  );
}
