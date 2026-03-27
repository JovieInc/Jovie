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
        'flex h-svh w-full overflow-hidden bg-(--linear-bg-page)',
        /* PWA safe area: pad top for notch/Dynamic Island in standalone mode */
        'pt-[env(safe-area-inset-top)]',
        containerClassName
      )}
    >
      {sidebar}

      <main
        id='main-content'
        className='flex flex-1 min-h-0 overflow-hidden bg-surface-0 lg:mt-[8px] lg:mr-[8px] lg:ml-px lg:rounded-t-[12px] lg:border lg:border-b-0 lg:border-(--linear-app-shell-border) lg:border-l-(--linear-app-shell-sidebar-seam) lg:bg-(--linear-app-content-surface) lg:shadow-[var(--linear-app-shell-shadow)] lg:peer-data-[state=open]:ml-0 lg:peer-data-[state=open]:rounded-tl-[10px] lg:peer-data-[state=open]:border-l-0 lg:peer-data-[state=open]:shadow-[-1px_0_0_0_var(--linear-app-frame-seam)_inset,var(--linear-app-shell-shadow)] lg:peer-data-[state=closed]:rounded-tl-[12px]'
      >
        <div className='flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'>
          {header}
          <div
            className={cn(
              'flex-1 min-h-0 min-w-0',
              isTableRoute
                ? 'overflow-hidden overflow-x-auto overscroll-contain'
                : 'overflow-y-auto overflow-x-hidden overscroll-contain',
              contentClassName
            )}
          >
            {main}
          </div>
        </div>
        {rightPanel}
      </main>

      {mobileBottomNav}
    </div>
  );
});
