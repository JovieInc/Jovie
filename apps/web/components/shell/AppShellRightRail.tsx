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
        // Mobile drawers are fixed descendants of this stacking context, so the
        // rail must sit above the z-20 shell header. Desktop returns to z-10.
        // self-stretch (not self-start): the rail sits beside the non-scrolling
        // shell clip and must fill the content-row height so open drawers clip
        // inside the rail instead of floating over the transcript (JOV-3958).
        'sticky top-0 z-30 flex h-full min-h-0 w-0 shrink-0 flex-col self-stretch overflow-hidden lg:z-10 lg:w-fit lg:p-1.5',
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
