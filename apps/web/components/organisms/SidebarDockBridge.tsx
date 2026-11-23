'use client';

import dynamic from 'next/dynamic';
import { type ComponentProps, useEffect, useState } from 'react';
import {
  SidebarDock,
  type SidebarDockUpdateControl,
} from '@/components/shell/SidebarDock';
import { SidebarOPresence } from '@/components/shell/SidebarOPresence';
import { usePublishSidebarDockStatus } from '@/components/shell/sidebar-dock-status';
import { APP_ROUTES } from '@/constants/routes';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import type { BrandVariant } from '@/lib/brand/tokens';
import type { DesktopUpdateControlState } from '@/lib/desktop/desktop-update-control-state';
import { useDesktopUpdateState } from '@/lib/desktop/useDesktopUpdateState';
import {
  isWhatsNewActionComplete,
  parseWhatsNewFeed,
  WHATS_NEW_PATH,
  type WhatsNewEntry,
  type WhatsNewUserState,
} from '@/lib/whats-new';
import { requestFullAudioPlayer } from './audio-chrome-state';
import {
  OPresenceProvider,
  useOPresence,
} from './o-presence/OPresenceProvider';
import {
  selectNowPlaying,
  useTrackAudioActions,
  useTrackAudioSnapshot,
} from './release-sidebar/useTrackAudioSnapshot';

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

/**
 * Footer only: the dock cards and the O. It adapts the existing updater,
 * changelog projection, audio player and PWA hook, and publishes the icon-rail
 * status to the identity row through context, so nothing above the footer
 * re-renders with it.
 */
export function SidebarDockBridge(
  props: ComponentProps<typeof SidebarDockBridgeInner>
) {
  return (
    <OPresenceProvider>
      <SidebarDockBridgeInner {...props} />
    </OPresenceProvider>
  );
}

function SidebarDockBridgeInner({
  userId,
  collapsed,
  fetchImpl = fetch,
  userState,
  oHref = APP_ROUTES.CHAT,
  variant = 'jovie',
}: {
  readonly fetchImpl?: typeof fetch;
  readonly userId: string;
  readonly userState?: WhatsNewUserState;
  readonly collapsed: boolean;
  /** Where the O leads: the main chat page of the current workspace. */
  readonly oHref?: string;
  readonly variant?: BrandVariant;
}) {
  const publishStatus = usePublishSidebarDockStatus();
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
  const { state: oState, nowPlaying } = useOPresence();
  const { activeTrackId, trackTitle } = useTrackAudioSnapshot(selectNowPlaying);
  const { toggleTrack } = useTrackAudioActions();
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

  const updating =
    updateControlKind === 'checking' || updateControlKind === 'downloading';
  return (
    <>
      <SidebarDock
        userId={userId}
        collapsed={collapsed}
        updateControl={dockUpdateControl}
        release={
          release && userState && isWhatsNewActionComplete(release, userState)
            ? null
            : release
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
        onStatusChange={publishStatus}
      />
      <SidebarOPresence
        updating={updating}
        variant={variant}
        href={oHref}
        inert={oState.sidebarInert}
        player={
          nowPlaying
            ? {
                title: nowPlaying.title,
                artist: nowPlaying.artist,
                isPlaying: nowPlaying.isPlaying,
                onToggle: () => {
                  if (activeTrackId && trackTitle)
                    void toggleTrack({
                      id: activeTrackId,
                      title: trackTitle,
                    }).catch(() => {});
                },
                onExpand: requestFullAudioPlayer,
              }
            : undefined
        }
      />
    </>
  );
}
