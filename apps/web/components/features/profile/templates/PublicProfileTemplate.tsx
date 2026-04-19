'use client';

import type { ReactNode } from 'react';
import { ArtistPageShell } from '@/features/profile/ArtistPageShell';
import type { ProfilePublicViewModel } from '@/features/profile/contracts';
import { getProfileModeDefinition } from '@/features/profile/registry';

interface PublicProfileTemplateProps {
  readonly viewModel: ProfilePublicViewModel;
  readonly viewerCountryCode?: string | null;
  readonly children: ReactNode;
}

/**
 * @deprecated Legacy: not used by live routes. Production profile rendering
 * goes through StaticArtistPage -> ProfileCompactTemplate.
 */
export function PublicProfileTemplate({
  viewModel,
  viewerCountryCode,
  children,
}: PublicProfileTemplateProps) {
  const definition = getProfileModeDefinition(viewModel.mode);

  return (
    <div className='w-full'>
      <ArtistPageShell
        artist={viewModel.artist}
        socialLinks={viewModel.socialLinks}
        viewerCountryCode={viewerCountryCode}
        contacts={viewModel.contacts}
        subtitle={viewModel.subtitle}
        mode={viewModel.mode}
        showSocialBar={definition.shell.showSocialBar}
        showPayButton={viewModel.showPayButton}
        isPayModeActive={viewModel.isPayModeActive}
        showBackButton={viewModel.showBackButton}
        showTourButton={viewModel.showTourButton}
        isTourModeActive={viewModel.isTourModeActive}
        showFooter={viewModel.showFooter}
        showNotificationButton={viewModel.showNotificationButton}
        showShopButton={viewModel.showShopButton}
        photoDownloadSizes={viewModel.photoDownloadSizes}
        allowPhotoDownloads={viewModel.allowPhotoDownloads}
        visitTrackingToken={viewModel.visitTrackingToken}
      >
        {children}
      </ArtistPageShell>
    </div>
  );
}
