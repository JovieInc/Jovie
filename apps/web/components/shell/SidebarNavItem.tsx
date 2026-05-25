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

interface SidebarNavChromeOptions {
  readonly active?: boolean;
  readonly collapsed?: boolean;
  readonly nested?: boolean;
  readonly tight?: boolean;
  readonly tone?: 'default' | 'primary';
  readonly className?: string;
}

const SIDEBAR_PRIMARY_CHROME =
  'border-[color-mix(in_oklab,var(--linear-app-frame-seam)_78%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_92%,white_8%)] text-primary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[color-mix(in_oklab,var(--linear-app-content-surface)_86%,white_14%)]';

const SIDEBAR_ACTIVE_CHROME =
  'border-sidebar-border bg-sidebar-accent-active text-primary-token font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_0_1px_color-mix(in_oklab,var(--linear-app-frame-seam)_62%,transparent)]';

function getInactiveColor(nested?: boolean): string {
  if (nested) {
    return 'text-sidebar-muted/65 hover:bg-sidebar-accent hover:text-sidebar-item-foreground';
  }

  return 'text-sidebar-muted/80 hover:bg-sidebar-accent hover:text-sidebar-item-foreground';
}

function getToneClassName({
  active,
  nested,
  tone,
}: Pick<SidebarNavChromeOptions, 'active' | 'nested' | 'tone'>): string {
  if (active) {
    return SIDEBAR_ACTIVE_CHROME;
  }

  if (tone === 'primary') {
    return SIDEBAR_PRIMARY_CHROME;
  }

  return getInactiveColor(nested);
}

export function getSidebarNavRowClassName({
  active,
  collapsed,
  nested,
  tight,
  tone = 'default',
  className,
}: SidebarNavChromeOptions) {
  const nonCollapsedSize = tight ? 'h-6 px-2.5' : 'h-7 px-2.5';

  return cn(
    'relative grid items-center rounded-full w-full border border-transparent transition-[background-color,border-color,box-shadow,color] duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
    'font-normal',
    'before:pointer-events-none before:absolute before:inset-y-1.5 before:left-[22px] before:w-px before:bg-[color-mix(in_oklab,var(--linear-app-frame-seam)_32%,transparent)]',
    'after:pointer-events-none after:absolute after:inset-y-1.5 after:left-[38px] after:w-px after:bg-[color-mix(in_oklab,var(--linear-app-frame-seam)_32%,transparent)]',
    'group-data-[collapsible=icon]:before:hidden group-data-[collapsible=icon]:after:hidden',
    tight ? 'gap-x-2 text-[12px]' : 'gap-x-2.5 text-[12.5px]',
    collapsed
      ? 'h-7 w-10 mx-auto grid-cols-1 place-items-center before:hidden after:hidden'
      : cn(
          'grid-cols-[22px_minmax(0,1fr)_34px]',
          nonCollapsedSize,
          'group-data-[collapsible=icon]:grid-cols-1 group-data-[collapsible=icon]:place-items-center'
        ),
    getToneClassName({ active, nested, tone }),
    className
  );
}

export function getSidebarNavIconClassName({
  active,
  nested,
  tight,
  className,
}: SidebarNavChromeOptions) {
  const inactiveIconColor = nested
    ? 'text-sidebar-muted/55'
    : 'text-sidebar-muted/70';

  return cn(
    'shrink-0 justify-self-center',
    tight ? 'h-3 w-3' : 'h-3.5 w-3.5',
    active ? 'text-primary-token' : inactiveIconColor,
    className
  );
}

export function SidebarNavItem({
  item,
  collapsed,
  nested,
  tight,
}: SidebarNavItemProps) {
  const button = (
    <button
      type='button'
      onClick={item.onActivate}
      className={getSidebarNavRowClassName({
        active: item.active,
        collapsed,
        nested,
        tight,
      })}
    >
      <item.icon
        className={getSidebarNavIconClassName({
          active: item.active,
          nested,
          tight,
        })}
        strokeWidth={2.25}
      />
      {!collapsed && (
        <span className='min-w-0 truncate text-left justify-self-start'>
          {item.label}
        </span>
      )}
    </button>
  );

  return (
    <Tooltip label={item.label} side='right' block>
      {button}
    </Tooltip>
  );
}
