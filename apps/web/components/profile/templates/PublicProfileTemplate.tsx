'use client';

import type { ReactNode } from 'react';
import { ArtistPageShell } from '@/components/profile/ArtistPageShell';
import type { ProfilePublicViewModel } from '@/components/profile/contracts';
import { getProfileModeDefinition } from '@/components/profile/registry';

interface PublicProfileTemplateProps {
  readonly viewModel: ProfilePublicViewModel;
  readonly children: ReactNode;
}

export function PublicProfileTemplate({
  viewModel,
  children,
}: PublicProfileTemplateProps) {
  const definition = getProfileModeDefinition(viewModel.mode);

  return (
    <div className='w-full'>
      <ArtistPageShell
        artist={viewModel.artist}
        socialLinks={viewModel.socialLinks}
        contacts={viewModel.contacts}
        subtitle={viewModel.subtitle}
        mode={viewModel.mode}
        showSocialBar={definition.shell.showSocialBar}
        showTipButton={viewModel.showTipButton}
        isTipModeActive={viewModel.isTipModeActive}
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
