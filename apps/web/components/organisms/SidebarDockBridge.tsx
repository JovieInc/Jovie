'use client';

import { type ReactNode, useEffect, useState } from 'react';
import {
  SidebarDock,
  type SidebarDockStatus,
} from '@/components/shell/SidebarDock';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import {
  parseWhatsNewFeed,
  WHATS_NEW_PATH,
  type WhatsNewEntry,
} from '@/lib/whats-new';
import {
  requestFullAudioPlayer,
  useAudioChromeSnapshot,
} from './audio-chrome-state';
import { useDesktopUpdateContext } from './desktop-update/DesktopUpdateProvider';
import { useTrackAudioPlayer } from './release-sidebar/useTrackAudioPlayer';

/** Adapt the existing updater, changelog projection, audio player and PWA hook. */
export function SidebarDockBridge({
  userId,
  collapsed,
  children,
  fetchImpl = fetch,
}: {
  readonly fetchImpl?: typeof fetch;
  readonly userId: string;
  readonly collapsed: boolean;
  readonly children: (status: SidebarDockStatus | undefined) => ReactNode;
}) {
  const update = useDesktopUpdateContext();
  const pwa = usePWAInstall();
  const audioChrome = useAudioChromeSnapshot();
  const { playbackState, stop, toggleTrack } = useTrackAudioPlayer();
  const [release, setRelease] = useState<WhatsNewEntry | null>(null);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void fetchImpl(WHATS_NEW_PATH, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(response => (response.ok ? response.json() : null))
      .then(value => {
        if (!controller.signal.aborted)
          setRelease(parseWhatsNewFeed(value)?.entries[0] ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [userId, fetchImpl]);

  const activeTrack = playbackState.activeTrackId && playbackState.trackTitle;
  return (
    <SidebarDock
      userId={userId}
      collapsed={collapsed}
      update={update?.state}
      onUpdate={update?.openModal}
      release={release}
      audio={
        activeTrack
          ? {
              track: {
                trackTitle: playbackState.trackTitle,
                artistName: playbackState.artistName,
                artworkUrl: playbackState.artworkUrl,
              },
              isPlaying: playbackState.isPlaying,
              reserved:
                audioChrome.fullPlayerVisible &&
                audioChrome.activeTrackId === playbackState.activeTrackId,
              onPlay: () => {
                if (playbackState.activeTrackId && playbackState.trackTitle)
                  void toggleTrack({
                    id: playbackState.activeTrackId,
                    title: playbackState.trackTitle,
                  }).catch(() => {});
              },
              onDismiss: stop,
              onExpand: requestFullAudioPlayer,
            }
          : undefined
      }
      install={
        pwa.canPrompt && !pwa.isInstalled
          ? {
              isIOS: pwa.isIOS,
              onInstall: pwa.isIOS
                ? pwa.dismiss
                : () => {
                    void pwa.install();
                  },
              onDismiss: pwa.dismiss,
            }
          : undefined
      }
    >
      {children}
    </SidebarDock>
  );
}
