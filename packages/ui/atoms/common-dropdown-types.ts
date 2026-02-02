import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Supported dropdown variants
 * - 'dropdown': Standard dropdown menu (click to open)
 * - 'select': Single-value selection dropdown
 * - 'context': Right-click context menu
 */
export type CommonDropdownVariant = 'dropdown' | 'select' | 'context';

/**
 * Item types within the dropdown
 */
export type CommonDropdownItemType =
  | 'action' // Simple click action
  | 'checkbox' // Multi-select toggle
  | 'radio' // Single-select within group
  | 'submenu' // Nested submenu
  | 'separator' // Visual divider
  | 'label' // Section header
  | 'custom'; // Custom JSX content

/**
 * Base item configuration
 */
export interface CommonDropdownBaseItem {
  id: string;
  type: CommonDropdownItemType;
  disabled?: boolean;
  className?: string;
}

/**
 * Action item - simple clickable action
 */
export interface CommonDropdownActionItem extends CommonDropdownBaseItem {
  type: 'action';
  label: string;
  icon?: LucideIcon | ReactNode;
  iconAfter?: LucideIcon | ReactNode; // For trailing icons/badges
  onClick: () => void;
  variant?: 'default' | 'destructive';
  shortcut?: string; // e.g., "⌘K"
  subText?: string; // Secondary text (right-aligned)
  badge?: {
    text: string;
    color?: string; // Hex color for badge background
  };
}

/**
 * Checkbox item - multi-select toggle
 */
export interface CommonDropdownCheckboxItem extends CommonDropdownBaseItem {
  type: 'checkbox';
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: LucideIcon;
}

/**
 * Radio item - single-select within group
 */
export interface CommonDropdownRadioItem extends CommonDropdownBaseItem {
  type: 'radio';
  label: string;
  value: string;
  icon?: LucideIcon | ReactNode;
}

/**
 * Radio group configuration
 */
export interface CommonDropdownRadioGroup extends CommonDropdownBaseItem {
  type: 'radio';
  value: string;
  onValueChange: (value: string) => void;
  items: Omit<CommonDropdownRadioItem, 'type'>[];
}

/**
 * Submenu item - nested menu
 */
export interface CommonDropdownSubmenu extends CommonDropdownBaseItem {
  type: 'submenu';
  label: string;
  icon?: LucideIcon | ReactNode;
  items: CommonDropdownItem[];
}

/**
 * Separator - visual divider
 */
export interface CommonDropdownSeparator extends CommonDropdownBaseItem {
  type: 'separator';
}

/**
 * Label - section header
 */
export interface CommonDropdownLabel extends CommonDropdownBaseItem {
  type: 'label';
  label: string;
  inset?: boolean;
}

/**
 * Custom content - render custom JSX
 */
export interface CommonDropdownCustomItem extends CommonDropdownBaseItem {
  type: 'custom';
  render: () => ReactNode;
}

/**
 * Union of all item types
 */
export type CommonDropdownItem =
  | CommonDropdownActionItem
  | CommonDropdownCheckboxItem
  | CommonDropdownRadioGroup
  | CommonDropdownSubmenu
  | CommonDropdownSeparator
  | CommonDropdownLabel
  | CommonDropdownCustomItem;

/**
 * Main component props
 */
export interface CommonDropdownProps {
  /**
   * Dropdown variant - controls behavior and rendering
   */
  readonly variant?: CommonDropdownVariant;

  /**
   * Items to render in the dropdown
   */
  readonly items: CommonDropdownItem[];

  /**
   * Trigger element (custom button, icon, or children for context menu)
   */
  readonly trigger?: ReactNode;

  /**
   * Default trigger type when no custom trigger provided
   * - 'button': Icon button (MoreVertical icon)
   * - 'select': Select-style button with ChevronDown
   */
  readonly defaultTriggerType?: 'button' | 'select';

  /**
   * Icon for default button trigger
   */
  readonly triggerIcon?: LucideIcon;

  /**
   * Alignment of dropdown content relative to trigger
   */
  readonly align?: 'start' | 'center' | 'end';

  /**
   * Side of trigger where dropdown appears
   */
  readonly side?: 'top' | 'right' | 'bottom' | 'left';

  /**
   * Offset from trigger (in pixels)
   */
  readonly sideOffset?: number;

  /**
   * Controlled open state
   */
  readonly open?: boolean;

  /**
   * Callback when open state changes
   */
  readonly onOpenChange?: (open: boolean) => void;

  /**
   * Disable portal rendering (render in DOM position)
   */
  readonly disablePortal?: boolean;

  /**
   * Portal container props
   */
  readonly portalProps?: Record<string, unknown>;

  /**
   * Additional className for content
   */
  readonly contentClassName?: string;

  /**
   * Additional className for trigger
   */
  readonly triggerClassName?: string;

  /**
   * Accessibility label
   */
  readonly 'aria-label'?: string;

  /**
   * Enable search/filter functionality
   */
  readonly searchable?: boolean;

  /**
   * Search placeholder text
   */
  readonly searchPlaceholder?: string;

  /**
   * Filter function for searchable dropdowns
   */
  readonly onSearch?: (query: string) => void;

  /**
   * Loading state (shows spinner)
   */
  readonly isLoading?: boolean;

  /**
   * Empty state message when no items
   */
  readonly emptyMessage?: string;

  /**
   * Disable the entire dropdown
   */
  readonly disabled?: boolean;

  /**
   * Children (used for context menu variant)
   */
  readonly children?: ReactNode;
}

/**
 * Select-specific props for select variant
 */
export interface CommonDropdownSelectProps
  extends Omit<CommonDropdownProps, 'variant' | 'items'> {
  readonly variant: 'select';
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: Array<{
    readonly value: string;
    readonly label: string;
    readonly icon?: LucideIcon;
    readonly disabled?: boolean;
  }>;
  readonly placeholder?: string;
}

// Type guard utilities
export function isActionItem(
  item: CommonDropdownItem
): item is CommonDropdownActionItem {
  return item.type === 'action';
}

export function isCheckboxItem(
  item: CommonDropdownItem
): item is CommonDropdownCheckboxItem {
  return item.type === 'checkbox';
}

export function isRadioGroup(
  item: CommonDropdownItem
): item is CommonDropdownRadioGroup {
  return item.type === 'radio';
}

export function isSubmenu(
  item: CommonDropdownItem
): item is CommonDropdownSubmenu {
  return item.type === 'submenu';
}

export function isSeparator(
  item: CommonDropdownItem
): item is CommonDropdownSeparator {
  return item.type === 'separator';
}

export function isLabel(item: CommonDropdownItem): item is CommonDropdownLabel {
  return item.type === 'label';
}

export function isCustomItem(
  item: CommonDropdownItem
): item is CommonDropdownCustomItem {
  return item.type === 'custom';
}
