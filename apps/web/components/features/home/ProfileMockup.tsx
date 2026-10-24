'use client';

import { HOMEPAGE_PROFILE_PREVIEW_ARTIST } from '@/features/home/homepage-profile-preview-fixture';
import { ProfileCompactSurface } from '@/features/profile/templates/ProfileCompactSurface';

export interface ProfileMockupProps {
  readonly name?: string | null;
  readonly tagline?: string | null;
  readonly handle?: string | null;
  readonly avatarUrl?: string | null;
}

const noop = () => {};

/** Canonical, static profile preview; it never simulates visitor behavior. */
export function ProfileMockup({
  name,
  tagline,
  handle,
  avatarUrl,
}: ProfileMockupProps = {}) {
  const artist = {
    ...HOMEPAGE_PROFILE_PREVIEW_ARTIST,
    name: name || HOMEPAGE_PROFILE_PREVIEW_ARTIST.name,
    tagline: tagline || HOMEPAGE_PROFILE_PREVIEW_ARTIST.tagline,
    handle: handle || HOMEPAGE_PROFILE_PREVIEW_ARTIST.handle,
    image_url: avatarUrl || HOMEPAGE_PROFILE_PREVIEW_ARTIST.image_url,
  };

  return (
    <figure
      aria-label='Profile Preview'
      className='marketing-rounded-frame overflow-hidden bg-surface-0 font-sans'
    >
      <ProfileCompactSurface
        artist={artist}
        socialLinks={[]}
        contacts={[]}
        renderMode='preview'
        presentation='embedded'
        drawerOpen={false}
        drawerView='menu'
        onDrawerOpenChange={noop}
        onDrawerViewChange={noop}
        onBack={noop}
        onOpenMenu={noop}
        onPlayClick={noop}
        onShare={noop}
        profileHref={`/${artist.handle}`}
        hideBackButton
        hideMoreMenu
        renderInteractiveOverlays={false}
        resolveNearbyTour={false}
        allowFanCapture={false}
      />
    </figure>
  );
}
