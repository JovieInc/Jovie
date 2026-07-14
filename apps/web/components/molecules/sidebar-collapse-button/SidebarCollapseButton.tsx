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
          // System B icon chrome: borderless circle, transparent idle, soft hover fill.
          // Matches ArtistProfileRailToggle — founder directive JOV-3959.
          'inline-flex h-7 w-7 items-center justify-center rounded-full border-0 bg-transparent text-secondary-token transition-[background-color,color] duration-subtle ease-subtle hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55',
          className
        )}
      >
        <PanelLeft className='h-3.5 w-3.5' strokeWidth={2} aria-hidden='true' />
      </button>
    </TooltipShortcut>
  );
}
