'use client';

import { useEffect, useMemo } from 'react';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelLink,
  usePreviewPanelData,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';

function convertSocialLinksToPreviewLinks(
  links: ProfileSocialLink[]
): PreviewPanelLink[] {
  return links
    .filter(l => l.state !== 'suggested' && l.state !== 'rejected')
    .map(link => ({
      id: link.id,
      title: link.displayText || link.platform,
      url: link.url,
      platform: link.platform,
      isVisible: link.isActive !== false,
    }));
}

/**
 * Hydrates PreviewPanelContext with profile data and links.
 * Use on pages that need the sidebar but don't use EnhancedDashboardLinks.
 * Renders nothing — side effect only.
 */
export function PreviewDataHydrator({
  initialLinks,
}: {
  readonly initialLinks: ProfileSocialLink[];
}) {
  const { setPreviewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();

  const previewLinks = useMemo(
    () => convertSocialLinksToPreviewLinks(initialLinks),
    [initialLinks]
  );

  useEffect(() => {
    if (!selectedProfile) return;
    setPreviewData({
      username: selectedProfile.username,
      displayName: selectedProfile.displayName ?? selectedProfile.username,
      avatarUrl: selectedProfile.avatarUrl ?? null,
      links: previewLinks,
      profilePath: `/${selectedProfile.username}`,
    });
  }, [selectedProfile, previewLinks, setPreviewData]);

  return null;
}
