'use client';

/**
 * UnreleasedReleaseHero Component
 *
 * Uses SmartLinkShell for the visual shell: full-width artwork hero,
 * menu button top-right, content area below with notification signup.
 */

import { Share2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { SmartLinkPoweredByFooter } from '@/features/release/SmartLinkPagePrimitives';
import { SmartLinkShell } from '@/features/release/SmartLinkShell';
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

const menuItemClass =
  'flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-white/88 transition-colors duration-150 active:bg-white/[0.06]';
const menuIconClass = 'h-[16px] w-[16px] text-white/40';

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

  const handleShare = useCallback(async () => {
    setMenuOpen(false);
    try {
      await navigator.share?.({
        title: `${release.title} — ${artist.name}`,
        url: globalThis.location.href,
      });
    } catch {
      // User cancelled or share not available
    }
  }, [release.title, artist.name]);

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
        <div className='flex flex-col gap-0.5' role='menu'>
          <button
            type='button'
            role='menuitem'
            className={menuItemClass}
            onClick={() => handleShare()}
          >
            <Share2 className={menuIconClass} />
            Share
          </button>
        </div>
      </ProfileDrawerShell>
    </ReleaseNotificationsProvider>
  );
}
