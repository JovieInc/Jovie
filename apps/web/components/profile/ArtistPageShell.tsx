'use client';

import React from 'react';
import { ProfileShell } from '@/components/organisms/profile-shell';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

type ArtistPageShellProps = {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle?: string;
  readonly children?: React.ReactNode;
  readonly showSocialBar?: boolean;
  readonly showTipButton?: boolean;
  readonly showBackButton?: boolean;
  readonly showFooter?: boolean;
  readonly maxWidthClass?: string;
  readonly showNotificationButton?: boolean;
};

// Using React.memo to prevent unnecessary re-renders when only children content changes
const ArtistPageShell = React.memo(function ArtistPageShell({
  artist,
  socialLinks,
  contacts = [],
  subtitle,
  children,
  showSocialBar = true,
  showTipButton = false,
  showBackButton = false,
  showFooter = true,
  maxWidthClass = 'w-full max-w-md',
  showNotificationButton = false,
}: ArtistPageShellProps) {
  return (
    <ProfileShell
      artist={artist}
      socialLinks={socialLinks}
      contacts={contacts}
      subtitle={subtitle}
      showSocialBar={showSocialBar}
      showTipButton={showTipButton}
      showBackButton={showBackButton}
      showFooter={showFooter}
      showNotificationButton={showNotificationButton}
      maxWidthClass={maxWidthClass}
      backgroundPattern='gradient'
      showGradientBlurs={true}
    >
      {children}
    </ProfileShell>
  );
});

export { ArtistPageShell };
