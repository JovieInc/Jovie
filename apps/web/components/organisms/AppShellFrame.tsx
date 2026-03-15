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
        'flex h-svh w-full overflow-hidden bg-base',
        /* PWA safe area: pad top for notch/Dynamic Island in standalone mode */
        'pt-[env(safe-area-inset-top)]',
        containerClassName
      )}
    >
      {sidebar}

      <main
        id='main-content'
        className='bg-surface-0 lg:border lg:border-strong lg:border-l-strong/80 lg:rounded-r-[18px] lg:rounded-bl-[18px] lg:rounded-tl-[14px] lg:m-2 lg:ml-0 lg:peer-data-[state=open]:ml-2 lg:peer-data-[state=open]:rounded-l-none lg:peer-data-[state=open]:border-l-0 lg:peer-data-[state=open]:shadow-[-1px_0_0_0_var(--linear-app-frame-seam)_inset] lg:peer-data-[state=closed]:rounded-l-[18px] flex flex-1 min-h-0 overflow-hidden'
      >
        <div className='flex flex-1 min-h-0 overflow-hidden'>
          <div className='flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'>
            {header}
            <div
              className={cn(
                'flex-1 min-h-0 min-w-0',
                isTableRoute
                  ? 'overflow-hidden overflow-x-auto overscroll-contain'
                  : 'overflow-y-auto overflow-x-hidden overscroll-contain p-4 sm:p-6',
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
