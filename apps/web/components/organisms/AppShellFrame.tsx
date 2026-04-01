import type { ReactNode } from 'react';
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface AppShellFrameProps {
  readonly sidebar: ReactNode;
  readonly header?: ReactNode;
  readonly main: ReactNode;
  readonly rightPanel?: ReactNode;
  readonly mobileBottomNav?: ReactNode;
  readonly contentClassName?: string;
  readonly containerClassName?: string;
  readonly isTableRoute?: boolean;
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
  mobileBottomNav,
  contentClassName,
  containerClassName,
  isTableRoute = false,
}: Readonly<AppShellFrameProps>) {
  return (
    <div
      className={cn(
        'flex h-full w-full overflow-hidden bg-(--linear-bg-page)',
        /* PWA safe area: pad top for notch/Dynamic Island in standalone mode */
        'pt-[env(safe-area-inset-top)]',
        'lg:p-2',
        containerClassName
      )}
    >
      {sidebar}

      <main
        id='main-content'
        className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-0 lg:ml-[var(--linear-app-shell-gap)] lg:rounded-[var(--linear-app-shell-radius)] lg:border lg:border-(--linear-app-shell-border) lg:bg-(--linear-app-content-surface) lg:shadow-[var(--linear-app-shell-shadow)]'
      >
        {header}
        <div className='flex flex-1 min-h-0 min-w-0 overflow-hidden lg:gap-[var(--linear-app-shell-gap)]'>
          <div
            className={cn(
              'flex-1 min-h-0 min-w-0 pb-[var(--dev-toolbar-height,0px)]',
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
      </main>

      {mobileBottomNav}
    </div>
  );
});
