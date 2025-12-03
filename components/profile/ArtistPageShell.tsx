import React from 'react';
import { ProfileShell } from '@/components/organisms/ProfileShell';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

type ArtistPageShellProps = {
  artist: Artist;
  socialLinks: LegacySocialLink[];
  contacts: PublicContact[];
  subtitle?: string;
  children?: React.ReactNode;
  showSocialBar?: boolean;
  showTipButton?: boolean;
  showBackButton?: boolean;
  showFooter?: boolean;
  maxWidthClass?: string;
};

// Using React.memo to prevent unnecessary re-renders when only children content changes
const ArtistPageShell = React.memo(function ArtistPageShell({
  artist,
  socialLinks,
  contacts,
  subtitle,
  children,
  showSocialBar = true,
  showTipButton = false,
  showBackButton = false,
  showFooter = true,
  maxWidthClass = 'w-full max-w-md',
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
      showNotificationButton
      maxWidthClass={maxWidthClass}
      backgroundPattern='gradient'
      showGradientBlurs={true}
    >
      {children}
    </ProfileShell>
  );
});

export { ArtistPageShell };
