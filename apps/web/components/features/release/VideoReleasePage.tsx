'use client';

/**
 * VideoReleasePage — Post-release video landing page.
 *
 * Uses SmartLinkShell for layout consistency with all smart link pages.
 * Hero shows YouTube thumbnail. Content area shows embed + email CTA.
 * Primary conversion goal: email subscription.
 *
 * If the embed fails to load, redirects to the artist's profile.
 * Never show a broken embed — a dead video page is a dead end for
 * fans AND the artist doesn't know about it.
 */

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { SmartLinkPoweredByFooter } from '@/features/release/SmartLinkPagePrimitives';
import { SmartLinkShell } from '@/features/release/SmartLinkShell';
import { PublicShareActionList } from '@/features/share/PublicShareMenu';
import { buildReleaseShareContext } from '@/lib/share/context';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import { YouTubeEmbed } from './YouTubeEmbed';

interface VideoReleasePageProps {
  readonly release: {
    readonly title: string;
    readonly slug: string;
    readonly artworkUrl: string | null;
  };
  readonly artist: {
    readonly id: string;
    readonly name: string;
    readonly handle: string;
    readonly avatarUrl: string | null;
    readonly ownerUserId: string;
    readonly spotifyId?: string;
  };
  readonly videoId: string;
  readonly youtubeUrl: string;
}

export function VideoReleasePage({
  release,
  artist,
  videoId,
  youtubeUrl,
}: VideoReleasePageProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const handleEmbedError = useCallback(() => {
    postJsonBeacon(
      '/api/track',
      {
        handle: artist.handle,
        linkType: 'error',
        target: 'video_embed_failed',
        source: 'video_release_page',
        context: {
          videoId,
          releaseSlug: release.slug,
          creatorProfileId: artist.id,
        },
      },
      () => {}
    );

    globalThis.location.replace(`/${artist.handle}`);
  }, [artist.handle, artist.id, videoId, release.slug]);
  const shareContext = buildReleaseShareContext({
    username: artist.handle,
    slug: release.slug,
    title: release.title,
    artistName: artist.name,
    artworkUrl: release.artworkUrl,
  });

  return (
    <SmartLinkShell
      artworkUrl={release.artworkUrl}
      artworkAlt={`${release.title} artwork`}
      onMenuOpen={() => setShareOpen(true)}
      heroOverlay={
        <div className='absolute inset-x-0 bottom-5 z-10 px-5'>
          <h1 className='text-[15px] font-[510] leading-[1.2] tracking-[-0.01em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]'>
            {release.title}
          </h1>
          <Link
            href={`/${artist.handle}`}
            className='mt-1 block text-[13px] font-[450] text-white/70 transition-colors hover:text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]'
          >
            {artist.name}
          </Link>
        </div>
      }
    >
      <div className='relative z-10 flex min-h-0 flex-1 flex-col px-5 pt-4'>
        <YouTubeEmbed
          videoId={videoId}
          title={`Music video: ${release.title} by ${artist.name}`}
          onError={handleEmbedError}
        />

        <div className='mt-6'>
          <ArtistNotificationsCTA
            artist={{
              id: artist.id,
              owner_user_id: artist.ownerUserId,
              handle: artist.handle,
              spotify_id: artist.spotifyId ?? '',
              name: artist.name,
              image_url: artist.avatarUrl ?? undefined,
              published: true,
              is_verified: false,
              is_featured: false,
              marketing_opt_out: false,
              created_at: '',
            }}
            variant='button'
            forceExpanded
            hideListenFallback
          />
        </div>

        <div className='mt-4 flex justify-center'>
          <a
            href={youtubeUrl}
            target='_blank'
            rel='noopener noreferrer'
            aria-label='Watch on YouTube (opens in new tab)'
            className='inline-flex items-center gap-1.5 text-[13px] font-[450] text-white/40 transition-colors hover:text-white/60'
          >
            <ExternalLink className='size-3.5' />
            Watch on YouTube
          </a>
        </div>

        <div className='mt-auto pt-6'>
          <SmartLinkPoweredByFooter />
        </div>
      </div>
      <ProfileDrawerShell
        open={shareOpen}
        onOpenChange={setShareOpen}
        title='Share'
        subtitle='Share this release'
      >
        <PublicShareActionList
          context={shareContext}
          onActionComplete={() => setShareOpen(false)}
        />
      </ProfileDrawerShell>
    </SmartLinkShell>
  );
}
