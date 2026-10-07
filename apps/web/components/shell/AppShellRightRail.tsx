'use client';

import type { ReactNode } from 'react';
import { useOptionalPreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SHELL_RAIL_ALLOCATION } from '@/components/shell/rail-motion';
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
  const previewState = useOptionalPreviewPanelState();
  const preview = previewState?.isFloating === true;
  return (
    <aside
      data-testid='app-shell-right-rail'
      data-shell-rail-motion='right'
      aria-label='Context Panel'
      data-rail-preview={previewState?.isPreview || undefined}
      data-rail-preview-region='right'
      style={
        preview
          ? { width: 0, padding: 0, overflow: 'visible', zIndex: 30 }
          : undefined
      }
      className={cn(
        // The mobile RightDrawer is viewport-fixed. Keep this mount neutral
        // below lg so it cannot clip the sheet; desktop alone owns the
        // self-stretch in-flow slot and clipping beside route content.
        'relative z-30 h-0 w-0 shrink-0 overflow-visible lg:sticky lg:top-0 lg:z-10 lg:flex lg:h-full lg:min-h-0 lg:w-fit lg:flex-col lg:self-stretch lg:overflow-hidden lg:p-1.5',
        // Shared rail-motion contract (JOV-4522): the same allocation class
        // the left sidebar mount uses, so both rails reclaim/yield canvas on
        // identical timing.
        SHELL_RAIL_ALLOCATION,
        'lg:rounded-(--app-shell-radius)',
        // A mounted closed profile preserves drawer state but reserves no seam.
        'lg:[&:has([data-shell-profile-only]_[aria-hidden=true])]:p-0',
        className
      )}
    >
      <div
        className={preview ? 'absolute right-0 top-0 h-full w-fit' : 'contents'}
      >
        {children}
      </div>
    </aside>
  );
}
