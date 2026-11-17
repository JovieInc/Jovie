'use client';

import dynamic from 'next/dynamic';
import { type ReactNode, useEffect, useState } from 'react';
import {
  SidebarDock,
  type SidebarDockStatus,
  type SidebarDockUpdateControl,
} from '@/components/shell/SidebarDock';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import type { DesktopUpdateControlState } from '@/lib/desktop/desktop-update-control-state';
import { useDesktopUpdateState } from '@/lib/desktop/useDesktopUpdateState';
import {
  isWhatsNewActionComplete,
  parseWhatsNewFeed,
  WHATS_NEW_PATH,
  type WhatsNewEntry,
  type WhatsNewUserState,
} from '@/lib/whats-new';
import {
  requestFullAudioPlayer,
  useAudioChromeSnapshot,
} from './audio-chrome-state';
import { useTrackAudioPlayer } from './release-sidebar/useTrackAudioPlayer';

// Desktop-only: keep the control (and the morph button it
// pulls in) out of every browser tab's shell chunk. The dock card reserves
// the row, so the late chunk cannot shift the footer.
const DesktopUpdateControl = dynamic(() =>
  import('./desktop-update/DesktopUpdateControl').then(mod => ({
    default: mod.DesktopUpdateControl,
  }))
);

/** Status the dock needs before the control's chunk is in. */
const UPDATE_CONTROL_NOTICE: Record<
  Exclude<DesktopUpdateControlState['kind'], 'hidden'>,
  string
> = {
  checking: 'Checking for updates',
  available: 'Update available',
  downloading: 'Downloading update',
  ready: 'Restart to update',
  restarting: 'Restarting to update',
  failed: 'Update failed',
  offline: 'Update paused, no connection',
};

/** Adapt the existing updater, changelog projection, audio player and PWA hook. */
export function SidebarDockBridge({
  userId,
  collapsed,
  children,
  fetchImpl = fetch,
  userState,
}: {
  readonly fetchImpl?: typeof fetch;
  readonly userId: string;
  readonly userState?: WhatsNewUserState;
  readonly collapsed: boolean;
  readonly children: (status: SidebarDockStatus | undefined) => ReactNode;
}) {
  const updateControl = useDesktopUpdateState();
  const updateControlKind = updateControl.state.kind;
  const dockUpdateControl: SidebarDockUpdateControl =
    updateControlKind === 'hidden'
      ? { visible: false, label: null, urgent: false, node: null }
      : {
          visible: true,
          label: UPDATE_CONTROL_NOTICE[updateControlKind],
          urgent: updateControlKind === 'failed',
          node: (
            <DesktopUpdateControl
              state={updateControl.state}
              onDownload={updateControl.download}
              onRestart={updateControl.restart}
              onRetry={updateControl.retry}
            />
          ),
        };
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
      updateControl={dockUpdateControl}
      release={
        release && userState && isWhatsNewActionComplete(release, userState)
          ? null
          : release
      }
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
