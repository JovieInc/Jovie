'use client';

/**
 * UnreleasedReleaseHero Component
 *
 * Uses SmartLinkShell for the visual shell: full-width artwork hero,
 * menu button top-right, content area below with notification signup.
 */

import { Share2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { SmartLinkPoweredByFooter } from '@/features/release/SmartLinkPagePrimitives';
import {
  SMART_LINK_MENU_ICON_CLASS,
  SMART_LINK_MENU_ITEM_CLASS,
  SmartLinkShell,
} from '@/features/release/SmartLinkShell';
import { PublicShareActionList } from '@/features/share/PublicShareMenu';
import { buildReleaseShareContext } from '@/lib/share/context';
import type { Artist } from '@/types/db';
import { PreSaveActions } from './PreSaveActions';
import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';

interface UnreleasedReleaseHeroProps {
  readonly release: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: Date;
    readonly trackId: string | null;
    readonly hasSpotify: boolean;
    readonly hasAppleMusic: boolean;
  };
  readonly artist: {
    readonly id: string;
    readonly name: string;
    readonly handle: string;
    readonly avatarUrl: string | null;
  };
}

function mapToArtistType(artist: UnreleasedReleaseHeroProps['artist']): Artist {
  return {
    id: artist.id,
    owner_user_id: '',
    handle: artist.handle,
    spotify_id: '',
    name: artist.name,
    image_url: artist.avatarUrl ?? undefined,
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
  };
}

export function UnreleasedReleaseHero({
  release,
  artist,
}: UnreleasedReleaseHeroProps) {
  const artistData = mapToArtistType(artist);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareContext = buildReleaseShareContext({
    username: artist.handle,
    slug: release.slug,
    title: release.title,
    artistName: artist.name,
    artworkUrl: release.artworkUrl,
  });

  return (
    <ReleaseNotificationsProvider artist={artistData}>
      <SmartLinkShell
        artworkUrl={release.artworkUrl}
        artworkAlt={`${release.title} artwork`}
        onMenuOpen={() => setMenuOpen(true)}
        heroOverlay={
          <div className='absolute inset-x-0 bottom-5 z-10 px-5'>
            <h1 className='text-[28px] font-[590] leading-[1.06] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]'>
              {release.title}
            </h1>
            <Link
              href={`/${artist.handle}`}
              className='mt-1 block text-[14px] font-[450] text-white/70 transition-colors hover:text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]'
            >
              {artist.name}
            </Link>
          </div>
        }
      >
        {/* Content — countdown + notification signup */}
        <div className='relative z-10 flex min-h-0 flex-1 flex-col px-5 pt-3'>
          <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
            <PreSaveActions
              releaseId={release.id}
              trackId={release.trackId}
              username={artist.handle}
              slug={release.slug}
              hasSpotify={release.hasSpotify}
              hasAppleMusic={release.hasAppleMusic}
              releaseDate={release.releaseDate}
              artistData={artistData}
            />
          </div>

          <div className='shrink-0 pb-[max(env(safe-area-inset-bottom),8px)]'>
            <SmartLinkPoweredByFooter />
          </div>
        </div>
      </SmartLinkShell>

      {/* Menu drawer */}
      <ProfileDrawerShell
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title='Menu'
      >
        <div className='flex flex-col gap-0.5'>
          <button
            type='button'
            className={SMART_LINK_MENU_ITEM_CLASS}
            onClick={() => {
              setMenuOpen(false);
              setShareOpen(true);
            }}
          >
            <Share2 className={SMART_LINK_MENU_ICON_CLASS} />
            Share
          </button>
        </div>
      </ProfileDrawerShell>
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
    </ReleaseNotificationsProvider>
  );
}
