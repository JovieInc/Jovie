import type { ReactNode } from 'react';
import { memo } from 'react';
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
  readonly isTableRoute?: boolean;
  readonly variant?: AppShellFrameVariant;
}

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
  isTableRoute = false,
  // Default to 'legacy' so callers that don't pass `variant` (AppShellSkeleton,
  // DemoShell, future surfaces) match the current production state. AuthShell
  // explicitly passes 'shellChatV1' when the SHELL_CHAT_V1 flag is on.
  variant = 'legacy',
}: Readonly<AppShellFrameProps>) {
  const isShellChatV1 = variant === 'shellChatV1';

  return (
    <div
      data-shell-design={variant}
      className={cn(
        'flex h-full w-full overflow-hidden',
        isShellChatV1 ? 'bg-(--linear-bg-page)' : 'bg-base',
        /* PWA safe area: pad top for notch/Dynamic Island in standalone mode (mobile only) */
        'max-lg:pt-[env(safe-area-inset-top)]',
        isShellChatV1 &&
          'lg:gap-[var(--linear-app-shell-gap)] lg:p-[var(--linear-app-shell-gap)]',
        containerClassName
      )}
    >
      {sidebar}

      <main
        id='main-content'
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-0',
          isShellChatV1
            ? 'lg:rounded-[var(--linear-app-shell-radius)] lg:border-t lg:border-r lg:border-b lg:border-(--linear-app-shell-border) lg:bg-(--linear-app-content-surface) lg:shadow-[var(--linear-app-shell-shadow)] lg:pt-px'
            : 'lg:border-l lg:border-subtle'
        )}
      >
        {header}
        <div
          className={cn(
            'flex flex-1 min-h-0 min-w-0 overflow-hidden',
            isShellChatV1 && 'lg:gap-[var(--linear-app-shell-gap)]'
          )}
        >
          <div
            className={cn(
              'flex flex-1 min-h-0 min-w-0 flex-col pb-[var(--dev-toolbar-height,0px)]',
              isTableRoute
                ? 'overflow-hidden overflow-x-auto overscroll-contain'
                : 'overflow-y-auto overflow-x-hidden overscroll-contain',
              contentClassName
            )}
          >
            {main}
          </div>
          {rightPanel}
        </div>
        {audioPlayer}
      </main>

      {mobileBottomNav}
    </div>
  );
});
