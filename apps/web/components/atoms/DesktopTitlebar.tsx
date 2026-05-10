'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useContext } from 'react';
import { UpdateAvailablePill } from '@/components/atoms/UpdateAvailablePill';
import { SidebarContext } from '@/components/organisms/sidebar/context';
import {
  useDesktopNavigation,
  useIsElectronRuntime,
} from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';

/**
 * DesktopTitlebar — Electron-only titlebar with traffic-light spacer,
 * back/forward arrows, and the update pill.
 *
 * Layout (left → right):
 *   [72px traffic-light spacer, drag]
 *   [← → nav buttons, no-drag]
 *   [flex-1 center spacer, drag]
 *   [UpdateAvailablePill, no-drag]
 *   [12px right padding, drag]
 *
 * Renders as a zero-height invisible element in the browser; CSS on
 * [data-electron-titlebar="true"] makes it visible only inside Electron.
 */
export function DesktopTitlebar() {
  const isDesktop = useIsElectronRuntime();
  const { canGoBack, canGoForward, goBack, goForward } = useDesktopNavigation();
  // useContext (not useSidebar) so this is safe outside SidebarProvider (e.g. demo shell)
  const sidebarCtx = useContext(SidebarContext);
  const sidebarOpen = sidebarCtx?.state === 'open';

  return (
    <div
      data-electron-titlebar='true'
      data-electron-drag-region='true'
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {isDesktop ? (
        <>
          {/* Traffic-light clearance — macOS hiddenInset reserves ~72px on the left */}
          <div className='w-[72px] shrink-0' />

          {/* Back / Forward navigation arrows */}
          <div
            className='flex items-center gap-0.5'
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              type='button'
              onClick={goBack}
              disabled={!canGoBack}
              aria-label='Go back'
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded text-secondary-token',
                'transition-colors duration-subtle',
                'hover:bg-white/[0.06] hover:text-primary-token',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
                'disabled:opacity-30 disabled:pointer-events-none'
              )}
            >
              <ArrowLeft className='h-3.5 w-3.5' strokeWidth={2} />
            </button>
            <button
              type='button'
              onClick={goForward}
              disabled={!canGoForward}
              aria-label='Go forward'
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded text-secondary-token',
                'transition-colors duration-subtle',
                'hover:bg-white/[0.06] hover:text-primary-token',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
                'disabled:opacity-30 disabled:pointer-events-none'
              )}
            >
              <ArrowRight className='h-3.5 w-3.5' strokeWidth={2} />
            </button>
          </div>

          {/* Center drag region */}
          <div
            className='flex-1'
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />

          {/* Update pill — compact when sidebar is open, full pill when sidebar is closed */}
          <div
            className='flex items-center pr-3'
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <UpdateAvailablePill compact={sidebarOpen} />
          </div>
        </>
      ) : null}
    </div>
  );
}
