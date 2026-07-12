import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type AppShellRightRailVariant = 'legacy' | 'shellChatV1';

export interface AppShellRightRailProps {
  /** Right-rail content — typically a RightDrawer or EntitySidebarShell tree. */
  readonly children: ReactNode;
  /** Shell design variant — mirrors AppShellFrame so rail chrome stays in sync. */
  readonly variant?: AppShellRightRailVariant;
  readonly className?: string;
}

/**
 * Shared AppShell right-rail frame slot.
 *
 * Owns the sticky structural container that sits beside the main scroll clip in
 * AppShellFrame. Card elevation, borders, and drawer width animation live in
 * RightDrawer / EntitySidebarShell / DrawerSurfaceCard — this primitive only
 * pins the rail outside route-owned scroll so list and grid surfaces do not
 * drag the context panel along with them.
 *
 * Usage (normally composed by AppShellFrame):
 *   <AppShellRightRail variant="shellChatV1">
 *     <EntitySidebarShell ...>{content}</EntitySidebarShell>
 *   </AppShellRightRail>
 */
export function AppShellRightRail({
  children,
  variant = 'legacy',
  className,
}: AppShellRightRailProps) {
  const isShellChatV1 = variant === 'shellChatV1';

  return (
    <aside
      data-testid='app-shell-right-rail'
      data-shell-design={variant}
      aria-label='Context Panel'
      className={cn(
        // self-stretch (not self-start): the rail sits beside the non-scrolling
        // shell clip and must fill the content-row height so open drawers clip
        // inside the rail instead of floating over the transcript (JOV-3958).
        'sticky top-0 z-10 flex h-full min-h-0 shrink-0 flex-col self-stretch overflow-hidden',
        // Mirror the left sidebar mount language so inner drawer width changes
        // reclaim canvas space with the same cinematic timing.
        'transition-[width,opacity,transform] duration-cinematic ease-cinematic motion-reduce:transition-none',
        isShellChatV1 && 'lg:rounded-(--linear-app-shell-radius)',
        className
      )}
    >
      {children}
    </aside>
  );
}
