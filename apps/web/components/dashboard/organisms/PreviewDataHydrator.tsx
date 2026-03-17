'use client';

import { useEffect, useMemo } from 'react';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelLink,
  usePreviewPanelData,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfileContactSidebar } from '@/components/dashboard/organisms/profile-contact-sidebar';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { AvailableDSP } from '@/lib/dsp';

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
      platformType:
        (link.platformType as
          | 'social'
          | 'dsp'
          | 'earnings'
          | 'custom'
          | 'websites'
          | undefined) ?? undefined,
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
  connectedDSPs,
}: {
  readonly initialLinks: ProfileSocialLink[];
  readonly connectedDSPs: readonly AvailableDSP[];
}) {
  const { setPreviewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();

  // Register ProfileContactSidebar in the unified right panel system
  useRegisterRightPanel(
    <ErrorBoundary fallback={null}>
      <ProfileContactSidebar />
    </ErrorBoundary>
  );

  const previewLinks = useMemo(
    () => convertSocialLinksToPreviewLinks(initialLinks),
    [initialLinks]
  );

  useEffect(() => {
    if (!selectedProfile) return;
    const canonicalUsername =
      selectedProfile.usernameNormalized ?? selectedProfile.username;
    setPreviewData({
      username: canonicalUsername,
      displayName: selectedProfile.displayName ?? canonicalUsername,
      avatarUrl: selectedProfile.avatarUrl ?? null,
      bio: selectedProfile.bio ?? null,
      genres: selectedProfile.genres ?? null,
      links: previewLinks,
      profilePath: `/${canonicalUsername}`,
      dspConnections: {
        spotify: {
          connected: connectedDSPs.some(dsp => dsp.key === 'spotify'),
          artistName: selectedProfile.spotifyId
            ? selectedProfile.displayName
            : null,
        },
        appleMusic: {
          connected: connectedDSPs.some(dsp => dsp.key === 'apple_music'),
          artistName: selectedProfile.appleMusicId
            ? selectedProfile.displayName
            : null,
        },
      },
    });
  }, [selectedProfile, previewLinks, setPreviewData, connectedDSPs]);

  return null;
}
