import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AppShellRightRailProps {
  /** Right-rail content — typically a RightDrawer or EntitySidebarShell tree. */
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Shared AppShell right-rail frame slot.
 *
 * Owns the sticky structural container inset inside the main workspace.
 * On desktop it is an in-flow sibling of the route column, so a drawer width
 * narrows the route surface rather than overlaying it. The inset belongs here;
 * entity elevation belongs to EntitySidebarShell so every rail shares it.
 * Mobile continues to be owned by RightDrawer's fixed sheet adapter.
 *
 * Usage (normally composed by AppShellFrame):
 *   <AppShellRightRail>
 *     <EntitySidebarShell ...>{content}</EntitySidebarShell>
 *   </AppShellRightRail>
 */
export function AppShellRightRail({
  children,
  className,
}: AppShellRightRailProps) {
  return (
    <aside
      data-testid='app-shell-right-rail'
      data-shell-rail-motion='right'
      aria-label='Context Panel'
      className={cn(
        // The mobile RightDrawer is viewport-fixed. Keep this mount neutral
        // below lg so it cannot clip the sheet; desktop alone owns the
        // self-stretch in-flow slot and clipping beside route content.
        'relative z-30 h-0 w-0 shrink-0 overflow-visible lg:sticky lg:top-0 lg:z-10 lg:flex lg:h-full lg:min-h-0 lg:w-fit lg:flex-col lg:self-stretch lg:overflow-hidden lg:p-1.5',
        // Mirror the left sidebar mount language so inner drawer width changes
        // reclaim canvas space with the same cinematic timing.
        'transition-[flex-basis,width,opacity,transform] duration-cinematic ease-cinematic motion-reduce:transition-none',
        'lg:rounded-(--linear-app-shell-radius)',
        className
      )}
    >
      {children}
    </aside>
  );
}
