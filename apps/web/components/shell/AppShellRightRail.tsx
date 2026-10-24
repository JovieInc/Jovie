'use client';

// @coverage-via apps/web/components/shell/__tests__/AppShellRightRail.test.tsx

import type { ReactNode } from 'react';
import { SHELL_RAIL_ALLOCATION } from '@/components/shell/rail-motion';
import { cn } from '@/lib/utils';

export interface AppShellRightRailProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/** Shared desktop inspector column, allocated beside the main column.
 * At lg and up it pushes the route aside using the shared rail motion. Mobile sheets retain the
 * RightDrawer viewport adapter; pointer and focus ownership stay with the drawer. */
export function AppShellRightRail({
  children,
  className,
}: AppShellRightRailProps) {
  return (
    <aside
      data-testid='app-shell-right-rail'
      data-shell-rail-motion='right'
      data-rail-preview-region='right'
      aria-label='Context Panel'
      className={cn(
        'pointer-events-none z-30 shell-inspector-allocation',
        SHELL_RAIL_ALLOCATION,
        className
      )}
    >
      <div className='pointer-events-auto h-full min-w-0 max-w-full'>
        {children}
      </div>
    </aside>
  );
}
