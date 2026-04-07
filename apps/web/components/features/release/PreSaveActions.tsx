'use client';

import { useCallback, useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import { useApplePreSaveMutation } from '@/lib/queries';
import type { Artist } from '@/types/db';
import { ReleaseCountdown } from './ReleaseCountdown';

interface PreSaveActionsProps {
  readonly releaseId: string;
  readonly trackId: string | null;
  readonly username: string;
  readonly slug: string;
  readonly hasSpotify: boolean;
  readonly hasAppleMusic: boolean;
  readonly releaseDate: Date;
  readonly artistData: Artist;
}

export function PreSaveActions({
  releaseId,
  trackId,
  username,
  slug,
  hasSpotify,
  hasAppleMusic,
  releaseDate,
  artistData,
}: PreSaveActionsProps) {
  const applePreSave = useApplePreSaveMutation();
  const [appleSaved, setAppleSaved] = useState(false);

  // TODO: Re-enable platform presaves once email signup flow is solid
  const enablePlatformPresaves = false;

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

  const handleApplePreAdd = useCallback(async () => {
    if (applePreSave.isPending || appleSaved) return;

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
      applePreSave.mutate(
        { releaseId, trackId, appleMusicUserToken: userToken },
        { onSuccess: () => setAppleSaved(true) }
      );
    } catch {
      // MusicKit authorization failed - no action needed
    }
  }, [applePreSave, appleSaved, releaseId, trackId]);

  const spotifyConfig = DSP_LOGO_CONFIG.spotify;
  const appleConfig = DSP_LOGO_CONFIG.apple_music;

  return (
    <div className='space-y-3'>
      {/* Countdown */}
      <div className='flex w-full items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05] px-4 py-3 backdrop-blur-2xl'>
        <ReleaseCountdown releaseDate={releaseDate} compact />
      </div>

      {/* Inline notification signup — same component as artist profiles */}
      <ProfileInlineNotificationsCTA artist={artistData} />

      {/* Platform presaves — flagged off for now */}
      {enablePlatformPresaves && hasSpotify ? (
        <SmartLinkProviderButton
          label='Spotify'
          iconPath={spotifyConfig?.iconPath}
          href={spotifyHref}
        />
      ) : null}

      {enablePlatformPresaves && hasAppleMusic ? (
        <SmartLinkProviderButton
          label={
            appleSaved || applePreSave.isSuccess
              ? 'Saved to Apple Music'
              : 'Apple Music'
          }
          iconPath={appleConfig?.iconPath}
          onClick={handleApplePreAdd}
        />
      ) : null}
    </div>
  );
}
