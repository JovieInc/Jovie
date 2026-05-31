'use client';

import React from 'react';
import { cn } from '@/lib/utils'; // Jovie convention for class merging

export interface AppShellRightRailProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly sticky?: boolean;
  readonly elevated?: boolean;
  /** Optional header slot (reuses DrawerHero patterns where applicable) */
  readonly header?: React.ReactNode;
}

/**
 * Shared AppShell right rail (context panel) primitive.
 * Consistent API + styling for all right rails.
 * Sticky, elevated card treatment, DESIGN tokens, radii/padding/borders/shadow.
 * No emoji, no decorative hover motion (per invariants).
 * Replaces inconsistent ad-hoc panels.
 *
 * Usage:
 *   <AppShellRightRail sticky elevated header={<DrawerHero ... />}>
 *     {panelContent}
 *   </AppShellRightRail>
 */
export function AppShellRightRail({
  children,
  className,
  sticky = true,
  elevated = true,
  header,
}: AppShellRightRailProps) {
  return (
    <aside
      className={cn(
        'w-full max-w-[320px] border-l bg-surface border-border',
        'flex flex-col',
        sticky &&
          'sticky top-0 h-[calc(100dvh-var(--header-h,0px)-var(--audio-h,0px))]',
        elevated && 'shadow-elevated rounded-l-lg',
        'overflow-y-auto',
        className
      )}
      data-testid='app-shell-right-rail'
      aria-label='Context panel'
    >
      {header && (
        <div className='shrink-0 border-b border-border bg-surface/95 backdrop-blur'>
          {header}
        </div>
      )}
      <div className='flex-1 p-4 text-sm text-primary-token'>{children}</div>
    </aside>
  );
}

export default AppShellRightRail;
