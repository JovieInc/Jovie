'use client';

import { TooltipShortcut } from '@jovie/ui';
import { PanelLeft } from 'lucide-react';
import { useSidebar } from '@/components/organisms/Sidebar';
import { SIDEBAR_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useSidebarKeyboardShortcut';
import { cn } from '@/lib/utils';

interface SidebarCollapseButtonProps {
  readonly className?: string;
}

export function SidebarCollapseButton({
  className,
}: SidebarCollapseButtonProps) {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === 'closed';
  const label = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const shortcut = SIDEBAR_KEYBOARD_SHORTCUT_BARE;

  return (
    <TooltipShortcut label={label} shortcut={shortcut} side='right'>
      <button
        type='button'
        onClick={toggleSidebar}
        aria-label={label}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_76%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_86%,transparent)] text-secondary-token transition-[background-color,border-color,color,box-shadow] duration-subtle hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55',
          className
        )}
      >
        <PanelLeft className='h-3.5 w-3.5' strokeWidth={2} aria-hidden='true' />
      </button>
    </TooltipShortcut>
  );
}
