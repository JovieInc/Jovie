'use client';

// @coverage-via apps/web/components/shell/__tests__/AppShellRightRail.test.tsx

import type { ReactNode } from 'react';
import { SHELL_RAIL_ALLOCATION } from '@/components/shell/rail-motion';
import { cn } from '@/lib/utils';

export interface AppShellRightRailProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Keeps an overlay preview below the shell header and its rail toggle. */
  readonly belowHeader?: boolean;
}

/** Shared desktop right rail slot, a sibling column of the route column.
 * Founder call (2026-11-08): an open or pinned rail pushes content and never
 * lays on top of it; only a drawer that requests the transient `overlay`
 * presentation (a hover/focus preview) floats over the route. Width, gap and
 * preview placement live in `shell-inspector-rail`; the drawer owns its
 * surface, width motion and focus lifecycle. Mobile sheets keep the
 * RightDrawer viewport adapter. */
export function AppShellRightRail({
  children,
  className,
  belowHeader = false,
}: AppShellRightRailProps) {
  return (
    <aside
      data-testid='app-shell-right-rail'
      data-shell-rail-motion='right'
      data-rail-preview-region='right'
      data-rail-below-header={belowHeader ? 'true' : undefined}
      aria-label='Context Panel'
      className={cn(
        'pointer-events-none z-30 shell-inspector-rail',
        SHELL_RAIL_ALLOCATION,
        className
      )}
    >
      <div className='pointer-events-auto h-full min-h-0 min-w-0'>
        {children}
      </div>
    </aside>
  );
}
