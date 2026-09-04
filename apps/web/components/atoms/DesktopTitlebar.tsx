'use client';

import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useContext } from 'react';
import { SidebarContext } from '@/components/organisms/sidebar/context';
import {
  useDesktopNavigation,
  useIsElectronRuntime,
} from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';

const DESKTOP_CHANNEL_LABELS = {
  production: 'Stable',
  staging: 'Canary',
  local: 'Local',
} as const;

const DESKTOP_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const FULL_SOURCE_REVISION = /^[0-9a-f]{40}$/;

type DesktopChannel = keyof typeof DESKTOP_CHANNEL_LABELS;

interface DesktopReleaseIdentityLabel {
  readonly ariaLabel: string;
  readonly provenance: 'identified' | 'unverified';
  readonly visibleLabel: string;
}

function isDesktopChannel(value: string | undefined): value is DesktopChannel {
  return value !== undefined && value in DESKTOP_CHANNEL_LABELS;
}

function readDesktopReleaseIdentity(): DesktopReleaseIdentityLabel {
  const dataset = globalThis.document?.documentElement.dataset;
  const channel = dataset?.desktopChannel;
  const channelLabel = isDesktopChannel(channel)
    ? DESKTOP_CHANNEL_LABELS[channel]
    : 'Desktop';
  const version = dataset?.desktopVersion;
  const hasVersion =
    typeof version === 'string' && DESKTOP_VERSION.test(version);
  const versionLabel = hasVersion ? version : 'Version Unknown';
  const sourceRevision = dataset?.desktopSourceRevision;
  const hasSourceRevision =
    typeof sourceRevision === 'string' &&
    FULL_SOURCE_REVISION.test(sourceRevision);
  const sourceLabel = hasSourceRevision
    ? sourceRevision.slice(0, 7)
    : 'Unverified';
  const provenance =
    isDesktopChannel(channel) && hasVersion && hasSourceRevision
      ? 'identified'
      : 'unverified';

  return {
    ariaLabel: `${channelLabel} environment, version ${hasVersion ? version : 'unknown'}, source revision ${hasSourceRevision ? sourceRevision : 'unverified'}`,
    provenance,
    visibleLabel: `${channelLabel} · ${versionLabel} · ${sourceLabel}`,
  };
}

/**
 * DesktopTitlebar — Electron-only titlebar drag region.
 *
 * Layout:
 *   [sidebar-width: traffic-light spacer, back/forward navigation]
 *   [main: forward nav, drag region]
 *
 * Renders as a zero-height invisible element in the browser; CSS on
 * [data-electron-titlebar="true"] makes it visible only inside Electron.
 */
export function DesktopTitlebar() {
  const isDesktop = useIsElectronRuntime();
  const releaseIdentity = readDesktopReleaseIdentity();
  const { canGoBack, canGoForward, goBack, goForward } = useDesktopNavigation();
  // useContext (not useSidebar) so this is safe outside SidebarProvider (e.g. demo shell)
  const sidebarCtx = useContext(SidebarContext);
  const sidebarOpen = sidebarCtx?.state === 'open';
  const toggleSidebar = sidebarCtx?.toggleSidebar;
  const sidebarToggleLabel = sidebarOpen
    ? 'Collapse sidebar'
    : 'Expand sidebar';

  return (
    <div
      data-electron-titlebar='true'
      data-testid='electron-titlebar-row'
      data-electron-drag-region='true'
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      {isDesktop ? (
        <>
          <div
            data-testid='electron-titlebar-sidebar-cell'
            className='flex min-w-0 items-center gap-1.5 px-2.5'
          >
            <div
              data-testid='electron-traffic-light-safe-area'
              className='w-(--electron-traffic-light-safe-width) shrink-0'
              aria-hidden='true'
            />
            {/* Single canonical sidebar toggle for Electron. */}
            <button
              type='button'
              onClick={toggleSidebar}
              disabled={!toggleSidebar}
              aria-label={sidebarToggleLabel}
              data-testid='electron-sidebar-toggle'
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-tertiary-token',
                'transition-colors duration-subtle',
                'hover:bg-white/[0.06] hover:text-primary-token',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
                'disabled:pointer-events-none disabled:opacity-30'
              )}
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <PanelLeft className='h-3.5 w-3.5' strokeWidth={2} />
            </button>
            <div
              data-testid='electron-nav-pill'
              className='flex shrink-0 items-center gap-0.5'
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <button
                type='button'
                onClick={goBack}
                disabled={!canGoBack}
                aria-label='Go Back'
                data-testid='electron-nav-back'
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-secondary-token',
                  'transition-colors duration-subtle',
                  'hover:bg-white/[0.06] hover:text-primary-token',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
                  'disabled:pointer-events-none disabled:opacity-30'
                )}
              >
                <ChevronLeft className='h-3.5 w-3.5' strokeWidth={2} />
              </button>
              <button
                type='button'
                onClick={goForward}
                disabled={!canGoForward}
                aria-label='Go Forward'
                data-testid='electron-nav-forward'
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-secondary-token',
                  'transition-colors duration-subtle',
                  'hover:bg-white/[0.06] hover:text-primary-token',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
                  'disabled:pointer-events-none disabled:opacity-30'
                )}
              >
                <ChevronRight className='h-3.5 w-3.5' strokeWidth={2} />
              </button>
            </div>
          </div>

          <div
            data-testid='electron-titlebar-main-cell'
            className='flex min-w-0 self-stretch items-center justify-center px-3'
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
          >
            <span
              aria-label={releaseIdentity.ariaLabel}
              className='pointer-events-none inline-flex max-w-full items-center whitespace-nowrap rounded-md bg-surface-1 px-2 py-0.5 text-2xs font-medium tabular-nums text-secondary-token'
              data-provenance={releaseIdentity.provenance}
              data-testid='electron-release-identity'
              role='status'
              title={releaseIdentity.ariaLabel}
            >
              {releaseIdentity.visibleLabel}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
