'use client';

import { memo, useCallback } from 'react';
import { CompactLinkRail } from '@/components/molecules/CompactLinkRail';
import {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
} from '@/components/organisms/contact-sidebar/utils';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';

export interface CreatorProfileSocialLinksProps {
  readonly socialLinks: AdminCreatorProfileRow['socialLinks'];
}

export const CreatorProfileSocialLinks = memo(
  function CreatorProfileSocialLinks({
    socialLinks,
  }: CreatorProfileSocialLinksProps) {
    const handleOpenLink = useCallback((url: string) => {
      globalThis.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    if (!socialLinks || socialLinks.length === 0) {
      return <span className='text-xs text-tertiary-token'>—</span>;
    }

    return (
      <CompactLinkRail
        items={socialLinks.slice(0, 3).map(link => {
          const username =
            extractUsernameFromUrl(link.url) ??
            extractUsernameFromLabel(link.displayText ?? '') ??
            '';
          const displayUsername = formatUsername(username);

          return {
            id: link.id,
            platformIcon: link.platform,
            platformName: link.platform,
            primaryText: displayUsername || link.platform,
            onClick: () => handleOpenLink(link.url),
          };
        })}
        countLabel='social links'
        summaryCount={socialLinks.length}
        summaryAriaLabel={`${socialLinks.length} social links`}
        maxVisible={3}
      />
    );
  }
);
