'use client';

import { Bell } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import { useApplePreSaveMutation } from '@/lib/queries';
import { ReleaseCountdown } from './ReleaseCountdown';

interface PreSaveActionsProps {
  readonly releaseId: string;
  readonly trackId: string | null;
  readonly username: string;
  readonly slug: string;
  readonly hasSpotify: boolean;
  readonly hasAppleMusic: boolean;
  readonly releaseDate: Date;
  readonly onNotifyMe?: () => void;
}

export function PreSaveActions({
  releaseId,
  trackId,
  username,
  slug,
  hasSpotify,
  hasAppleMusic,
  releaseDate,
  onNotifyMe,
}: PreSaveActionsProps) {
  const applePreSave = useApplePreSaveMutation();
  const [appleSaved, setAppleSaved] = useState(false);

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
    <div className='mt-5 space-y-2'>
      {/* Countdown header */}
      <div className='rounded-2xl bg-surface-1/50 px-4 py-3 ring-1 ring-inset ring-white/[0.08]'>
        <ReleaseCountdown releaseDate={releaseDate} compact />
      </div>

      {/* Action rows — same style as release page DSP buttons */}
      {hasSpotify ? (
        <SmartLinkProviderButton
          label='Spotify'
          iconPath={spotifyConfig?.iconPath}
          href={spotifyHref}
        />
      ) : null}

      {hasAppleMusic ? (
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

      {onNotifyMe ? (
        <SmartLinkProviderButton
          label='Notify Me'
          icon={<Bell className='h-5 w-5 shrink-0 text-muted-foreground' />}
          onClick={onNotifyMe}
        />
      ) : null}
    </div>
  );
}
