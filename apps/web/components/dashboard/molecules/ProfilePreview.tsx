'use client';

import { StaticArtistPage } from '@/components/profile/StaticArtistPage';
import { cn } from '@/lib/utils';
import { Artist } from '@/types/db';

export interface ProfilePreviewProps {
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  readonly links: Array<{
    readonly id: string;
    readonly title: string;
    readonly url: string;
    readonly platform: string;
    readonly isVisible: boolean;
  }>;
  readonly className?: string;
}

export function ProfilePreview({
  username,
  displayName,
  avatarUrl,
  links,
  className,
}: ProfilePreviewProps) {
  const resolvedDisplayName = displayName.trim() ? displayName : username;

  // Create a mock artist object that matches the Artist type exactly
  const mockArtist: Artist = {
    id: 'preview',
    owner_user_id: 'preview-owner',
    handle: username,
    spotify_id: '',
    name: resolvedDisplayName,
    image_url: avatarUrl || undefined,
    tagline: 'This is a preview of how your profile will appear to visitors',
    theme: {},
    settings: {
      hide_branding: false,
    },
    spotify_url: undefined,
    apple_music_url: undefined,
    youtube_url: undefined,
    venmo_handle: undefined,
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
  };

  // Convert links to LegacySocialLink format
  const socialLinks = links.map(link => ({
    id: link.id,
    platform: link.platform,
    url: link.url,
    title: link.title,
    order: 0, // Not used in the preview
    is_visible: link.isVisible,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    artist_id: 'preview',
    clicks: 0,
  }));

  return (
    <div className={cn('w-full h-full overflow-hidden rounded-2xl', className)}>
      <div className='relative h-full w-full'>
        <StaticArtistPage
          mode='profile'
          artist={mockArtist}
          socialLinks={socialLinks}
          subtitle=''
          showTipButton={false}
          showBackButton={false}
          contacts={[]}
          showFooter={false}
          autoOpenCapture={false}
        />
      </div>
    </div>
  );
}
