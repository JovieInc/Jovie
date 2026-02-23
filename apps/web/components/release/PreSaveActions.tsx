'use client';

import { CheckCircle2, Music2 } from 'lucide-react';
import { useMemo, useState } from 'react';

interface PreSaveActionsProps {
  readonly releaseId: string;
  readonly trackId: string | null;
  readonly username: string;
  readonly slug: string;
  readonly hasSpotify: boolean;
  readonly hasAppleMusic: boolean;
}

export function PreSaveActions({
  releaseId,
  trackId,
  username,
  slug,
  hasSpotify,
  hasAppleMusic,
}: PreSaveActionsProps) {
  const [appleState, setAppleState] = useState<'idle' | 'done' | 'loading'>(
    'idle'
  );

  const spotifyHref = useMemo(() => {
    const params = new URLSearchParams({
      releaseId,
      username,
      slug,
    });

    if (trackId) {
      params.set('trackId', trackId);
    }

    return `/api/pre-save/spotify/start?${params.toString()}`;
  }, [releaseId, trackId, slug, username]);

  const handleApplePreAdd = async () => {
    if (appleState === 'loading') return;
    setAppleState('loading');

    try {
      const music =
        typeof window !== 'undefined'
          ? (
              window as Window & {
                MusicKit?: {
                  getInstance: () => { authorize: () => Promise<string> };
                };
              }
            ).MusicKit
          : undefined;

      if (!music?.getInstance) {
        throw new Error('MusicKit unavailable');
      }

      const userToken = await music.getInstance().authorize();
      const response = await fetch('/api/pre-save/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId,
          trackId,
          appleMusicUserToken: userToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Apple pre-add failed');
      }

      setAppleState('done');
    } catch {
      setAppleState('idle');
    }
  };

  return (
    <div className='mt-5 space-y-2'>
      <p className='text-center text-xs text-white/55'>
        Save it now. Listen instantly on release day.
      </p>
      <div className='grid grid-cols-1 gap-2'>
        {hasSpotify ? (
          <a
            href={spotifyHref}
            className='inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1ed760] px-4 text-sm font-semibold text-black transition hover:brightness-95'
          >
            <Music2 className='size-4' aria-hidden='true' />
            Pre-save on Spotify
          </a>
        ) : null}

        {hasAppleMusic ? (
          <button
            type='button'
            onClick={handleApplePreAdd}
            className='inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90'
          >
            {appleState === 'done' ? (
              <>
                <CheckCircle2 className='size-4' aria-hidden='true' />
                Added on Apple Music
              </>
            ) : (
              'Pre-add on Apple Music'
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
