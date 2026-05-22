'use client';

import { ArrowLeft, ArrowRight, PanelLeft } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useContext } from 'react';
import { UpdateAvailablePill } from '@/components/atoms/UpdateAvailablePill';
import { SidebarContext } from '@/components/organisms/sidebar/context';
import {
  useDesktopNavigation,
  useIsElectronRuntime,
} from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';

interface DesktopTitlebarProps {
  readonly mainSlot?: ReactNode;
}

/**
 * DesktopTitlebar — Electron-only titlebar grid with traffic-light spacer,
 * update pill, and back/forward arrows.
 *
 * Layout:
 *   [sidebar-width: traffic-light spacer, sidebar toggle, update pill]
 *   [main: back/forward nav pill group, drag region]
 *
 * Renders as a zero-height invisible element in the browser; CSS on
 * [data-electron-titlebar="true"] makes it visible only inside Electron.
 *
 * The sidebar toggle here is the single canonical toggle in Electron mode —
 * the in-sidebar SidebarDockButton is hidden via CSS when inside the desktop
 * runtime so there is never a duplicate.
 */
export function DesktopTitlebar({ mainSlot }: DesktopTitlebarProps) {
  const isDesktop = useIsElectronRuntime();
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
            className='flex min-w-0 items-center gap-2 px-2.5'
          >
            {/* Traffic-light clearance — macOS hiddenInset reserves ~72px on the left */}
            <div className='w-[72px] shrink-0' aria-hidden='true' />
            {/* Single canonical sidebar toggle for Electron — the in-sidebar
                SidebarDockButton is hidden in desktop runtime via globals.css */}
            <button
              type='button'
              onClick={toggleSidebar}
              disabled={!toggleSidebar}
              aria-label={sidebarToggleLabel}
              data-testid='electron-sidebar-toggle'
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-secondary-token',
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
              className='ml-auto min-w-0 shrink-0'
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <UpdateAvailablePill compact={sidebarOpen} />
            </div>
          </div>

          <div
            data-testid='electron-titlebar-main-cell'
            className='flex min-w-0 items-center self-stretch overflow-hidden rounded-t-[var(--linear-app-shell-radius)] border border-b-0 border-(--linear-app-shell-border) bg-(--linear-app-content-surface) px-3'
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
          >
            {/* Nav pill group — back + forward in a single pill-shaped container */}
            <div
              className='flex shrink-0 items-center rounded-full bg-white/[0.05] p-0.5'
              data-testid='electron-nav-pill'
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <button
                type='button'
                onClick={goBack}
                disabled={!canGoBack}
                aria-label='Go back'
                data-testid='electron-nav-back'
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-secondary-token',
                  'transition-colors duration-subtle',
                  'hover:bg-white/10 hover:text-primary-token',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
                  'disabled:pointer-events-none disabled:opacity-30'
                )}
              >
                <ArrowLeft className='h-3 w-3' strokeWidth={2} />
              </button>
              <button
                type='button'
                onClick={goForward}
                disabled={!canGoForward}
                aria-label='Go forward'
                data-testid='electron-nav-forward'
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-secondary-token',
                  'transition-colors duration-subtle',
                  'hover:bg-white/10 hover:text-primary-token',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
                  'disabled:pointer-events-none disabled:opacity-30'
                )}
              >
                <ArrowRight className='h-3 w-3' strokeWidth={2} />
              </button>
            </div>

            {mainSlot ? (
              <div
                data-testid='electron-titlebar-main-slot'
                className='min-w-0 flex-1'
                style={{ WebkitAppRegion: 'drag' } as CSSProperties}
              >
                {mainSlot}
              </div>
            ) : (
              <div
                className='min-w-0 flex-1 self-stretch'
                style={{ WebkitAppRegion: 'drag' } as CSSProperties}
              />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
