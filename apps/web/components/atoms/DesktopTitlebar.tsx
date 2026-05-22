'use client';

import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';
import { useContext } from 'react';
import { UpdateAvailablePill } from '@/components/atoms/UpdateAvailablePill';
import { SidebarContext } from '@/components/organisms/sidebar/context';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';

/**
 * DesktopTitlebar — Electron-only titlebar drag region.
 *
 * Layout:
 *   [sidebar-width: traffic-light spacer, back/forward, sidebar toggle, update pill]
 *   [main: drag region only]
 *
 * Renders as a zero-height invisible element in the browser; CSS on
 * [data-electron-titlebar="true"] makes it visible only inside Electron.
 *
 * The sidebar toggle here is the single canonical toggle in Electron mode —
 * the in-sidebar SidebarDockButton is not rendered in desktop runtime so
 * there is never a duplicate.
 *
 * Back/forward keyboard shortcuts (Cmd+[ / Cmd+]) remain wired via
 * useDesktopNavigation in components that need them; visible controls sit
 * beside the traffic-light rail for native desktop discoverability.
 *
 * The page header is no longer rendered in the titlebar — it lives at the
 * top of the elevated content card below so the card (header included)
 * collapses/expands with the sidebar.
 */
export function DesktopTitlebar() {
  const router = useRouter();
  const isDesktop = useIsElectronRuntime();
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
            {/* Traffic-light clearance — macOS hiddenInset reserves ~72px on the left */}
            <div className='w-[72px] shrink-0' aria-hidden='true' />
            <div
              data-testid='electron-nav-pill'
              className='flex shrink-0 items-center gap-0.5'
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <button
                type='button'
                onClick={() => router.back()}
                aria-label='Go back'
                data-testid='electron-nav-back'
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-secondary-token',
                  'transition-colors duration-subtle',
                  'hover:bg-white/[0.06] hover:text-primary-token',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
                )}
              >
                <ChevronLeft className='h-3.5 w-3.5' strokeWidth={2} />
              </button>
              <button
                type='button'
                onClick={() => router.forward()}
                aria-label='Go forward'
                data-testid='electron-nav-forward'
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-secondary-token',
                  'transition-colors duration-subtle',
                  'hover:bg-white/[0.06] hover:text-primary-token',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
                )}
              >
                <ChevronRight className='h-3.5 w-3.5' strokeWidth={2} />
              </button>
            </div>
            {/* Single canonical sidebar toggle for Electron — the in-sidebar
                SidebarDockButton is not rendered in desktop runtime */}
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
              <UpdateAvailablePill />
            </div>
          </div>

          <div
            data-testid='electron-titlebar-main-cell'
            className='self-stretch'
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
          />
        </>
      ) : null}
    </div>
  );
}
