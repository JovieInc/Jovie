'use client';

import { CheckCircle2, Music2 } from 'lucide-react';
import { useMemo } from 'react';
import { useApplePreSaveMutation } from '@/lib/queries';

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
  const applePreSave = useApplePreSaveMutation();

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
    if (applePreSave.isPending) return;

    try {
      const music = globalThis.window
        ? (
            globalThis.window as Window & {
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
      applePreSave.mutate({
        releaseId,
        trackId,
        appleMusicUserToken: userToken,
      });
    } catch {
      // MusicKit authorization failed - no action needed
    }
  };

  return (
    <div className='mt-5 space-y-2'>
      <p className='text-muted-foreground text-center text-xs'>
        Save it now. Listen instantly on release day.
      </p>
      <div className='grid grid-cols-1 gap-2'>
        {hasSpotify ? (
          <a
            href={spotifyHref}
            className='inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-spotify px-4 text-sm font-semibold text-background transition-colors hover:bg-brand-spotify-hover'
          >
            <Music2 className='size-4' aria-hidden='true' />
            Pre-save on Spotify
          </a>
        ) : null}

        {hasAppleMusic ? (
          <button
            type='button'
            onClick={handleApplePreAdd}
            className='inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-apple px-4 text-sm font-semibold text-background transition-colors hover:bg-brand-apple-hover'
          >
            {applePreSave.isSuccess ? (
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
