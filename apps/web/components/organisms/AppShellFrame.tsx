import type { ReactNode } from 'react';
import { memo } from 'react';
import { CanvasGrain } from '@/components/atoms/CanvasGrain';
import { DesktopTitlebar } from '@/components/atoms/DesktopTitlebar';
import { AppShellRightRail } from '@/components/shell/AppShellRightRail';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { cn } from '@/lib/utils';

export type AppShellFrameVariant = 'legacy' | 'shellChatV1';

interface AppShellFrameProps {
  readonly sidebar: ReactNode;
  readonly header?: ReactNode;
  readonly main: ReactNode;
  readonly rightPanel?: ReactNode;
  readonly audioPlayer?: ReactNode;
  readonly mobileBottomNav?: ReactNode;
  readonly contentClassName?: string;
  readonly containerClassName?: string;
  readonly variant?: AppShellFrameVariant;
  /** When true (desktop), sidebar dims and right rail slides partially off-screen. */
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
  // Default to 'legacy' so callers that don't pass `variant` (AppShellSkeleton,
  // DemoShell, future surfaces) match the current production state. AuthShell
  // explicitly passes 'shellChatV1' when DESIGN_V1 is on.
  variant = 'legacy',
  composerFocusActive = false,
  chatAmbientGradient = false,
}: Readonly<AppShellFrameProps>) {
  const isShellChatV1 = variant === 'shellChatV1';

  return (
    <div
      data-app-shell-frame='true'
      data-shell-design={variant}
      data-composer-focus={composerFocusActive ? 'true' : undefined}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden',
        isShellChatV1 ? 'bg-(--linear-bg-page)' : 'bg-base',
        /* PWA safe area: pad top for notch/Dynamic Island in standalone mode (mobile only) */
        'max-lg:pt-[env(safe-area-inset-top)]',
        containerClassName
      )}
    >
      <DesktopTitlebar />
      <div
        data-app-shell-body='true'
        className={cn(
          'flex min-h-0 min-w-0 flex-1 overflow-hidden',
          isShellChatV1 &&
            'lg:gap-(--linear-app-shell-gap) lg:p-(--linear-app-shell-gap)'
        )}
      >
        <div
          data-testid='app-shell-sidebar-mount'
          className='flex h-full min-h-0 shrink-0 flex-col transition-opacity duration-cinematic ease-cinematic motion-reduce:transition-none'
        >
          {sidebar}
        </div>

        <main
          id='main-content'
          className={cn(
            // `isolate` gives <main> its own stacking context so the negative-z
            // chat ambient layer below paints above main's background but
            // beneath the in-flow header/content (#13386).
            'relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-0',
            isShellChatV1
              ? 'lg:rounded-(--linear-app-shell-radius) lg:border lg:border-(--linear-app-shell-border) lg:bg-(--linear-app-content-surface) lg:shadow-(--linear-app-shell-shadow)'
              : 'lg:border-l lg:border-subtle'
          )}
        >
          {/* Full-bleed ambient wash on chat routes — spans the whole content
              panel so its top edge is above the (transparent) header band.
              Negative z-index is load-bearing: an absolute sibling with z-auto
              would paint ON TOP of the in-flow static header; `-z-10` inside
              the isolated <main> paints it above main's background but beneath
              the header and content. Opaque content-surface fill preserves the
              previous chat canvas tone on all breakpoints. Pure background:
              pointer-events-none, no layout impact (#13386, preserves the
              full-viewport guarantee from #12135 / JOV-3614). */}
          {chatAmbientGradient ? (
            <div
              aria-hidden='true'
              data-testid='chat-ambient-gradient'
              className='pointer-events-none absolute inset-0 -z-10 bg-(--linear-app-content-surface)'
              style={{ backgroundImage: CHAT_AMBIENT_GRADIENT_IMAGE }}
            />
          ) : null}
          {isCodeFlagEnabled('CANVAS_GRAIN') && <CanvasGrain />}
          {header}
          <div
            className={cn(
              'flex flex-1 min-h-0 min-w-0 overflow-hidden',
              isShellChatV1 && 'lg:gap-(--linear-app-shell-gap)'
            )}
          >
            <div
              data-testid='app-shell-scroll'
              className={cn(
                // Shell-level pane never owns vertical scroll — routes and table
                // surfaces scroll inside this clip so the right rail stays fixed.
                'flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden overflow-x-auto overscroll-contain pb-[var(--dev-toolbar-height,0px)]',
                contentClassName
              )}
            >
              {main}
            </div>
            {rightPanel ? (
              <AppShellRightRail variant={variant}>
                {rightPanel}
              </AppShellRightRail>
            ) : null}
          </div>
          {audioPlayer}
        </main>
      </div>

      {mobileBottomNav}
    </div>
  );
});
