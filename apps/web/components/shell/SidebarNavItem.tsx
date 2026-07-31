import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

// SidebarNavItem — single nav row in the shell sidebar. Icon + label with
// collapsed (icon-only) + nested (workspace child) + tight density modes.
// Active state: filled bg + white text, no border (borderless chrome per #13217).
// Nested inactive: dimmer icon.
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
  /** An absolute trailing action layers over the label's faded edge. */
  readonly trailingOverlay?: boolean;
  readonly tone?: 'default' | 'primary';
  readonly className?: string;
}

// Create actions are deliberately not a second selected-nav treatment. Their
// blue icon and stronger label distinguish creation without competing with the
// route's neutral active state.
const SIDEBAR_PRIMARY_CHROME =
  'text-primary-token font-medium hover:bg-sidebar-accent';

// Active state uses a quiet neutral fill with white type and a Jovie teal icon.
// Avoid a left rail or guide decoration so every shared sidebar consumer keeps
// the same compact geometry.
const SIDEBAR_ACTIVE_CHROME =
  'bg-sidebar-accent-active text-white font-medium shadow-none';

const SIDEBAR_INACTIVE_CHROME =
  'text-sidebar-item-foreground hover:bg-sidebar-accent hover:text-sidebar-item-foreground';

function getToneClassName({
  active,
  tone,
}: Pick<SidebarNavChromeOptions, 'active' | 'nested' | 'tone'>): string {
  if (active) {
    return SIDEBAR_ACTIVE_CHROME;
  }

  if (tone === 'primary') {
    return SIDEBAR_PRIMARY_CHROME;
  }

  return SIDEBAR_INACTIVE_CHROME;
}

export function getSidebarNavRowClassName({
  active,
  collapsed,
  nested,
  tight,
  trailingOverlay,
  tone = 'default',
  className,
}: SidebarNavChromeOptions) {
  const nonCollapsedSize = tight ? 'h-6 px-2.5' : 'h-7 px-2.5';

  return cn(
    'relative grid items-center rounded-full w-full transition-[background-color,box-shadow,color] duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
    'font-normal',
    tight ? 'gap-x-2 text-xs' : 'gap-x-2.5 text-xs',
    collapsed
      ? 'h-7 w-10 mx-auto grid-cols-1 place-items-center'
      : cn(
          trailingOverlay
            ? 'grid-cols-[22px_minmax(0,1fr)]'
            : 'grid-cols-[22px_minmax(0,1fr)_minmax(34px,auto)]',
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
  tone,
  className,
}: SidebarNavChromeOptions) {
  const inactiveIconColor = nested
    ? 'text-sidebar-muted/55'
    : 'text-sidebar-muted/70';

  return cn(
    'shrink-0 justify-self-center',
    tight ? 'h-3 w-3' : 'h-3.5 w-3.5',
    // The selected row deliberately owns white label text. Keep its icon on
    // the canonical Jovie teal token so the active signal remains quiet.
    active
      ? 'text-accent-teal!'
      : tone === 'primary'
        ? 'text-accent-blue'
        : inactiveIconColor,
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
        <span className='min-w-0 justify-self-stretch overflow-hidden whitespace-nowrap text-clip text-left [mask-image:linear-gradient(to_right,black_calc(100%_-_1rem),transparent)]'>
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
