import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

// SidebarNavItem — single nav row in the shell sidebar. Icon + label with
// collapsed (icon-only) + nested (workspace child) + tight density modes.
// Active state: filled bg + white text. Nested inactive: dimmer icon.
// Always wrapped in a Tooltip so collapsed mode still shows the label.

export interface ShellNavItem {
  readonly icon: React.ComponentType<{
    readonly className?: string;
    readonly strokeWidth?: number;
  }>;
  readonly label: string;
  readonly active?: boolean;
  // Optional: clicking invokes this handler. Omit for visual-only items.
  readonly onActivate?: () => void;
}

export interface SidebarNavItemProps {
  readonly item: ShellNavItem;
  readonly collapsed: boolean;
  readonly nested?: boolean;
  readonly tight?: boolean;
}

export function SidebarNavItem({
  item,
  collapsed,
  nested,
  tight,
}: SidebarNavItemProps) {
  const nonCollapsedSize = tight ? 'h-6 pl-2.5 pr-2' : 'h-6.5 pl-2.5 pr-2';
  const inactiveColor = nested
    ? 'text-tertiary-token hover:bg-[color-mix(in_oklab,var(--color-sidebar-accent)_82%,transparent)] hover:text-primary-token'
    : 'text-secondary-token hover:bg-[color-mix(in_oklab,var(--color-sidebar-accent)_82%,transparent)] hover:text-primary-token';
  const inactiveIconColor = nested
    ? 'text-quaternary-token'
    : 'text-tertiary-token';

  const button = (
    <button
      type='button'
      onClick={item.onActivate}
      className={cn(
        'relative flex items-center rounded-md w-full transition-[background-color] duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
        tight ? 'gap-2 text-[12px]' : 'gap-2.5 text-[12.5px]',
        collapsed ? 'h-7 w-10 mx-auto justify-center' : nonCollapsedSize,
        item.active ? 'text-primary-token bg-surface-1' : inactiveColor
      )}
    >
      <item.icon
        className={cn(
          'shrink-0',
          tight ? 'h-3 w-3' : 'h-3.5 w-3.5',
          item.active ? 'text-primary-token' : inactiveIconColor
        )}
        strokeWidth={2.25}
      />
      {!collapsed && <span className='truncate'>{item.label}</span>}
    </button>
  );

  return (
    <Tooltip label={item.label} side='right' block>
      {button}
    </Tooltip>
  );
}
