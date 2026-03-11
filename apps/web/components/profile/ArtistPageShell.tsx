'use client';

import React from 'react';
import { ProfileShell } from '@/components/organisms/profile-shell';
import type { ProfileMode } from '@/components/profile/contracts';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

type ArtistPageShellProps = {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle?: string;
  readonly children?: React.ReactNode;
  readonly showSocialBar?: boolean;
  readonly mode?: ProfileMode;
  readonly showTipButton?: boolean;
  readonly isTipModeActive?: boolean;
  readonly showBackButton?: boolean;
  readonly showTourButton?: boolean;
  readonly isTourModeActive?: boolean;
  readonly showFooter?: boolean;
  readonly maxWidthClass?: string;
  readonly showNotificationButton?: boolean;
  /** Available download sizes for profile photo */
  readonly photoDownloadSizes?: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowPhotoDownloads?: boolean;
  /** HMAC-signed tracking token for authenticating visit tracking requests */
  readonly visitTrackingToken?: string;
};

// Using React.memo to prevent unnecessary re-renders when only children content changes
const ArtistPageShell = React.memo(function ArtistPageShell({
  artist,
  socialLinks,
  contacts = [],
  subtitle,
  children,
  showSocialBar = true,
  mode,
  showTipButton = false,
  isTipModeActive = false,
  showBackButton = false,
  showTourButton = false,
  isTourModeActive = false,
  showFooter = true,
  maxWidthClass = 'w-full max-w-md',
  showNotificationButton = false,
  photoDownloadSizes = [],
  allowPhotoDownloads = false,
  visitTrackingToken,
}: ArtistPageShellProps) {
  return (
    <ProfileShell
      artist={artist}
      socialLinks={socialLinks}
      contacts={contacts}
      subtitle={subtitle}
      showSocialBar={showSocialBar}
      mode={mode}
      showTipButton={showTipButton}
      isTipModeActive={isTipModeActive}
      showBackButton={showBackButton}
      showTourButton={showTourButton}
      isTourModeActive={isTourModeActive}
      showFooter={showFooter}
      showNotificationButton={showNotificationButton}
      maxWidthClass={maxWidthClass}
      backgroundPattern='gradient'
      showGradientBlurs={true}
      photoDownloadSizes={photoDownloadSizes}
      allowPhotoDownloads={allowPhotoDownloads}
      visitTrackingToken={visitTrackingToken}
    >
      {children}
    </ProfileShell>
  );
});

export { ArtistPageShell };
