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
        className='flex flex-1 min-h-0 overflow-hidden bg-surface-0 lg:m-1.5 lg:ml-0.5 lg:rounded-[16px] lg:border lg:border-(--linear-app-shell-border) lg:border-l-(--linear-app-shell-sidebar-seam) lg:bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] lg:shadow-[0_0_0_1px_color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent),0_18px_40px_rgba(0,0,0,0.05)] lg:peer-data-[state=open]:ml-1 lg:peer-data-[state=open]:rounded-l-[14px] lg:peer-data-[state=open]:border-l-0 lg:peer-data-[state=open]:shadow-[-1px_0_0_0_var(--linear-app-frame-seam)_inset,0_18px_40px_rgba(0,0,0,0.05)] lg:peer-data-[state=closed]:rounded-l-[16px]'
      >
        <div className='flex flex-1 min-h-0 overflow-hidden'>
          <div className='flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'>
            {header}
            <div
              className={cn(
                'flex-1 min-h-0 min-w-0',
                isTableRoute
                  ? 'overflow-hidden overflow-x-auto overscroll-contain'
                  : 'overflow-y-auto overflow-x-hidden overscroll-contain p-1 sm:p-1.5 lg:p-1.5',
                contentClassName
              )}
            >
              {main}
            </div>
          </div>
          {rightPanel}
        </div>
      </main>

      {mobileBottomNav}
    </div>
  );
});
