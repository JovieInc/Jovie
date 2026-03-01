import type { ReactNode } from 'react';
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
 */
export function AppShellFrame({
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
        containerClassName
      )}
    >
      {sidebar}

      <div
        id='main-content'
        tabIndex={-1}
        className='bg-surface-0 lg:border-[0.5px] lg:border-strong lg:rounded-lg lg:m-2 lg:ml-0 flex flex-1 min-h-0 overflow-hidden'
      >
        <div className='flex flex-1 min-h-0 overflow-hidden'>
          <div className='flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'>
            {header}
            <div
              className={cn(
                'flex-1 min-h-0 min-w-0',
                isTableRoute
                  ? 'overflow-hidden overflow-x-auto'
                  : 'overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6',
                contentClassName
              )}
            >
              {main}
            </div>
          </div>
          {rightPanel}
        </div>
      </div>

      {mobileBottomNav}
    </div>
  );
}
