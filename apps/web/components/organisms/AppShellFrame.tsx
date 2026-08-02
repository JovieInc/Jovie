import type { ReactNode } from 'react';
import { memo } from 'react';
import { CanvasGrain } from '@/components/atoms/CanvasGrain';
import { DesktopTitlebar } from '@/components/atoms/DesktopTitlebar';
import { AppShellRightRail } from '@/components/shell/AppShellRightRail';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { cn } from '@/lib/utils';

interface AppShellFrameProps {
  readonly sidebar: ReactNode;
  readonly header?: ReactNode;
  readonly main: ReactNode;
  readonly rightPanel?: ReactNode;
  readonly audioPlayer?: ReactNode;
  readonly mobileBottomNav?: ReactNode;
  readonly contentClassName?: string;
  readonly containerClassName?: string;
  /** When true (desktop), sidebar dims and right rail fully collapses off-canvas. */
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
        data-shell-rail-motion='coordinated'
        className={cn(
          // Allocation belongs to the shell, not individual routes. Keeping the
          // side slots and main plane on the same motion contract means a rail
          // can yield canvas without its content or adjacent route snapping.
          'flex min-h-0 min-w-0 flex-1 overflow-hidden transition-[gap,padding] duration-cinematic ease-cinematic motion-reduce:transition-none lg:gap-(--app-shell-gap) lg:p-(--app-shell-gap)'
        )}
      >
        <div
          data-testid='app-shell-sidebar-mount'
          className='flex h-full min-h-0 shrink-0 flex-col transition-[flex-basis,width,opacity,transform] duration-cinematic ease-cinematic motion-reduce:transition-none'
        >
          {sidebar}
        </div>

        <div
          data-app-shell-content-column='true'
          className='flex min-h-0 min-w-0 flex-1 flex-col transition-[flex-basis,width] duration-cinematic ease-cinematic motion-reduce:transition-none'
        >
          <div
            data-app-shell-main-plane='true'
            className='flex min-h-0 min-w-0 flex-1 overflow-hidden transition-[flex-basis,width] duration-cinematic ease-cinematic motion-reduce:transition-none'
          >
            <main
              id='main-content'
              className={cn(
                // The header and route column live on this one raised plane.
                // Do not use a translucent recessed well here: it makes the
                // frame, header, and content read as unrelated backgrounds.
                'relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-(--app-shell-content-surface)',
                'lg:rounded-(--app-shell-radius) lg:border lg:border-(--app-shell-border) lg:bg-(--app-shell-content-surface) lg:shadow-(--linear-app-shell-shadow)'
              )}
            >
              <div
                data-app-shell-main-content='true'
                className='relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[flex-basis,width] duration-cinematic ease-cinematic motion-reduce:transition-none'
              >
                {/* The chat wash belongs to the route plane, not the contextual
                    inspector. Keeping the isolated paint layer in this column
                    lets the in-flow rail narrow content without tinting its own
                    raised surface. */}
                {chatAmbientGradient ? (
                  <div
                    aria-hidden='true'
                    data-testid='chat-ambient-gradient'
                    className='pointer-events-none absolute inset-0 -z-10 bg-(--app-shell-content-surface)'
                    style={{ backgroundImage: CHAT_AMBIENT_GRADIENT_IMAGE }}
                  />
                ) : null}
                {isCodeFlagEnabled('CANVAS_GRAIN') && <CanvasGrain />}
                {header}
                <div className='flex min-h-0 min-w-0 flex-1 overflow-hidden'>
                  <div
                    data-testid='app-shell-scroll'
                    className={cn(
                      // Shell-level pane never owns vertical scroll — routes and table
                      // surfaces scroll inside this clip so the right rail stays fixed.
                      'flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden overflow-x-auto overscroll-contain transition-[flex-basis,width] duration-cinematic ease-cinematic motion-reduce:transition-none pb-[var(--dev-toolbar-height,0px)]',
                      contentClassName
                    )}
                  >
                    {main}
                  </div>
                </div>
              </div>
              {rightPanel ? (
                <AppShellRightRail>{rightPanel}</AppShellRightRail>
              ) : null}
            </main>
          </div>
          {/* The player is shell chrome, not content-card chrome. Keeping it as
              an in-flow sibling reserves its own tray below <main>, matching
              the sidebar's canvas elevation without obscuring routes or rails. */}
          {audioPlayer ? (
            <div data-testid='app-shell-audio-tray' className='shrink-0'>
              {audioPlayer}
            </div>
          ) : null}
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
    </div>
  );
});
