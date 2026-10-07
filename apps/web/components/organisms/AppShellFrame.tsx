// @coverage-via apps/web/tests/unit/components/organisms/AppShellFrame.test.tsx

import type { ReactNode } from 'react';
import { memo } from 'react';
import { DesktopTitlebar } from '@/components/organisms/DesktopTitlebar';
import { AppShellRightRail } from '@/components/shell/AppShellRightRail';
import { OverlayInteractionGuard } from '@/components/shell/OverlayInteractionGuard';
import {
  SHELL_RAIL_ALLOCATION,
  SHELL_RAIL_FRAME_GAP,
  SHELL_RAIL_MAIN_PLANE,
} from '@/components/shell/rail-motion';
import { cn } from '@/lib/utils';

export interface AppShellFrameProps {
  readonly sidebar: ReactNode;
  readonly header?: ReactNode;
  readonly main: ReactNode;
  readonly rightPanel?: ReactNode;
  readonly audioPlayer?: ReactNode;
  readonly mobileBottomNav?: ReactNode;
  readonly contentClassName?: string;
  readonly containerClassName?: string;
  /** Local composer-focus signal. Must not dim shell chrome or collapse the reserved rail. */
  readonly composerFocusActive?: boolean;
  /**
   * Chat routes render the ambient blue wash at the shell level so it spans
   * the full content panel — including the header band — instead of starting
   * below the shell header (#13386). Pairs with a transparent DashboardHeader
   * fill and JovieChat deferring its own gradient layer.
   */
  readonly chatAmbientGradient?: boolean;
}

/**
 * Single source of truth for the chat ambient wash. Top-weighted radial so it
 * fades out well above the opaque composer dock; anchored at the top of the
 * shell content panel so the header band sits inside the wash (full bleed).
 */
export const CHAT_AMBIENT_GRADIENT_IMAGE =
  'radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, var(--color-accent-blue) 6%, transparent), transparent 60%)';

/**
 * AppShellFrame is a presentational shell primitive shared by authenticated,
 * demo, and loading shell variants.
 *
 * Memoized to prevent re-renders when parent components (AuthShellWrapper)
 * re-render due to pathname changes. The sidebar, header, and main content
 * are passed as ReactNode props — React will diff them individually without
 * unmounting the frame itself.
 */
export const AppShellFrame = memo(function AppShellFrame({
  sidebar,
  header,
  main,
  rightPanel,
  audioPlayer,
  mobileBottomNav,
  contentClassName,
  containerClassName,
  composerFocusActive = false,
  chatAmbientGradient = false,
}: Readonly<AppShellFrameProps>) {
  return (
    <div
      data-app-shell-frame='true'
      data-composer-focus={composerFocusActive ? 'true' : undefined}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-(--linear-bg-page)',
        /* PWA safe area: pad top for notch/Dynamic Island in standalone mode (mobile only) */
        'max-lg:pt-[env(safe-area-inset-top)]',
        containerClassName
      )}
    >
      <DesktopTitlebar />
      <div
        data-app-shell-body='true'
        data-electron-top-gap-owner='titlebar'
        data-shell-rail-motion='coordinated'
        className={cn(
          // Allocation belongs to the shell, not individual routes. Keeping the
          // side slots and main plane on the same motion contract means a rail
          // can yield canvas without its content or adjacent route snapping.
          'flex min-h-0 min-w-0 flex-1 overflow-hidden lg:gap-(--app-shell-gap) lg:p-(--app-shell-gap)',
          SHELL_RAIL_FRAME_GAP
        )}
      >
        <div
          data-app-shell-sidebar-mount='true'
          data-testid='app-shell-sidebar-mount'
          className={cn(
            'flex h-full min-h-0 shrink-0 flex-col',
            SHELL_RAIL_ALLOCATION
          )}
        >
          {sidebar}
        </div>

        <div
          data-app-shell-content-column='true'
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            SHELL_RAIL_MAIN_PLANE
          )}
        >
          <div
            data-app-shell-main-plane='true'
            className={cn(
              // This plane clips shell chrome; route panes own scrolling.
              // overflow:hidden is still programmatically scrollable, so a
              // hovering inspector's travel can let scrollIntoView move the
              // entire header and route by 6px. Clip without a scroll box.
              'flex min-h-0 min-w-0 flex-1 overflow-clip',
              SHELL_RAIL_MAIN_PLANE
            )}
          >
            {/* Main content and audio keep one stable width. The inspector
                overlays within the route bounds and never allocates canvas. */}
            <div
              data-app-shell-main-column='true'
              className='flex min-h-0 min-w-0 flex-1 flex-col'
            >
              <main
                id='main-content'
                className={cn(
                  // The header and route column live on this one raised plane.
                  // Do not use a translucent recessed well here: it makes the
                  // frame, header, and content read as unrelated backgrounds.
                  // Founder lock 2026-09-25: one rounded, borderless, clipped
                  // panel — no border, soft elevation only.
                  'relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--app-shell-content-surface)',
                  'lg:rounded-(--app-shell-radius) lg:bg-(--app-shell-content-surface) lg:shadow-(--app-shell-shadow)'
                )}
              >
                {/* The wash covers the full panel, including its header. */}
                {chatAmbientGradient ? (
                  <div
                    aria-hidden='true'
                    data-testid='chat-ambient-gradient'
                    className='pointer-events-none absolute inset-0 -z-10 bg-(--app-shell-content-surface)'
                    style={{ backgroundImage: CHAT_AMBIENT_GRADIENT_IMAGE }}
                  />
                ) : null}
                {header ? (
                  <div
                    data-app-shell-header='true'
                    className='relative z-40 shrink-0'
                  >
                    {header}
                  </div>
                ) : null}
                <div
                  data-app-shell-main-content='true'
                  // No inset here: the header spans the panel edge-to-edge so
                  // the top row and route read as one clipped plane (JOV-7207).
                  // The route inset lives on the scroll wrapper below.
                  className={cn(
                    'relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:shell-inspector-host',
                    SHELL_RAIL_MAIN_PLANE
                  )}
                >
                  <div
                    data-app-shell-content-inset='true'
                    className='flex min-h-0 min-w-0 flex-1 overflow-hidden p-(--app-shell-content-inset)'
                  >
                    <div
                      data-testid='app-shell-scroll'
                      className={cn(
                        // Shell-level pane never owns vertical scroll — routes and table
                        // surfaces scroll inside this clip so the right rail stays fixed.
                        'flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden overflow-x-auto overscroll-contain pb-[var(--dev-toolbar-height,0px)]',
                        SHELL_RAIL_MAIN_PLANE,
                        contentClassName
                      )}
                    >
                      {main}
                    </div>
                  </div>
                  {rightPanel ? (
                    <AppShellRightRail>{rightPanel}</AppShellRightRail>
                  ) : null}
                </div>
              </main>
              {/* The player is shell chrome, not content-card chrome. The dock
                  is an in-flow sibling below <main> so its reveal slides the
                  panel's bottom edge up in lockstep — only panel height
                  animates, never content geometry. */}
              {audioPlayer ? (
                <div data-testid='app-shell-audio-tray' className='shrink-0'>
                  {audioPlayer}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {mobileBottomNav ? (
        <div
          className='system-b-app-mobile-bottom-surface shrink-0 lg:hidden'
          data-testid='app-shell-mobile-bottom-surface'
        >
          {mobileBottomNav}
        </div>
      ) : null}
      <OverlayInteractionGuard />
    </div>
  );
});
