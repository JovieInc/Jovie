/**
 * Unified Admin Table Design Tokens & Styles
 * Inspired by Linear.app for clean visual hierarchy and polish
 */

// Typography Scale - Visual Hierarchy
export const typography = {
  tableHeader:
    'text-app font-caption text-secondary-token tracking-normal line-clamp-1',
  cellPrimary: 'text-app font-caption text-primary-token', // Main content
  cellSecondary: 'text-app text-secondary-token', // Supporting info
  cellTertiary: 'text-xs text-tertiary-token', // Metadata, timestamps
  rowNumber: 'text-app tabular-nums text-tertiary-token', // Monospace numbers
  groupHeader: 'text-app font-semibold text-primary-token', // Group headers
} as const;

// Alignment & Spacing - Perfect Vertical Alignment
export const alignment = {
  checkboxCell: 'flex items-center justify-center', // Center checkbox
  numberCell: 'flex items-center justify-end tabular-nums', // Right-align numbers
  rowHeight: 'system-b-table-row-height', // Comfortable density with room for two-line cells
  cellPadding: 'px-3 py-1', // Balanced padding for cells
  headerPadding: 'px-3 py-1.5', // Slightly more header breathing room
  checkboxSize: 'h-3.5 w-3.5', // 14px checkbox
} as const;

// Row Selection Colors — aligned with Linear design tokens
export const selection = {
  unchecked: 'system-b-table-selection-unchecked',
  checked: 'system-b-table-selection-checked',
  selected: 'system-b-table-selection-selected',
  hover: 'system-b-table-selection-hover',
} as const;

export const rowState = {
  base: 'system-b-table-row-base',
  hover: 'system-b-table-row-hover',
  focusVisible: 'system-b-table-row-focus-visible',
  focusWithin: 'system-b-table-row-focus-within',
  focused: 'system-b-table-row-focused',
  selected: 'system-b-table-row-selected',
  checked: 'system-b-table-row-checked',
} as const;

// Icon Colors (use CSS variables where possible)
export const iconColors = {
  // Sort indicator - matches tertiary-token but slightly more visible
  sortIndicator: 'text-tertiary-token',
} as const;

// Z-Index Layers
export const zIndex = {
  toolbar: 'z-30',
  groupHeader: 'z-25',
  tableHeader: 'z-20',
  rows: 'z-10',
} as const;

// Transition Timings — Linear uses 160ms cubic-bezier for bg
export const transitions = {
  fast: 'transition-colors duration-fast ease-out',
  standard: 'transition-colors duration-fast ease-out',
  slow: 'transition-colors duration-cinematic ease-out',
} as const;

// Column Widths (Standard)
export const columnWidths = {
  checkbox: 'w-14', // 56px
  avatar: 'w-12', // 48px
  small: 'system-b-table-column-small',
  medium: 'system-b-table-column-medium',
  large: 'system-b-table-column-large',
  xlarge: 'system-b-table-column-xlarge',
  actions: 'system-b-table-column-actions',
} as const;

// Layout Stability - Fixed Heights to Prevent Layout Shift
export const layoutStability = {
  rowHeight: '40px',
  headerHeight: '32px',
  toolbarHeight: '56px',
  footerHeight: '52px',
  emptyStateMinHeight: '400px',
  skeletonRowHeight: '40px', // Must match rowHeight
} as const;

// Border Styles
export const borders = {
  cell: 'border-b border-subtle',
  header: 'border-b border-subtle',
  groupHeader: 'border-b-2 border-subtle',
  subtle: 'border-subtle',
} as const;

// Loading Skeleton Styles
export const skeleton = {
  base: 'skeleton motion-reduce:animate-none rounded',
  text: 'h-4 w-24',
  avatar: 'h-8 w-8 rounded-full',
  badge: 'h-5 w-16 rounded-full',
  button: 'h-8 w-20 rounded-md',
} as const;

// Animation Classes
export const animations = {
  spin: 'animate-spin',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce',
  fadeIn: 'animate-fade-in',
  fadeOut: 'animate-fade-out',
  slideIn: 'animate-slide-in',
  slideOut: 'animate-slide-out',
} as const;

// Responsive Breakpoints
export const breakpoints = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
} as const;

// Helper function to combine classes
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Preset combinations for common patterns
export const presets = {
  stickyHeader: cn(
    'sticky top-0',
    zIndex.tableHeader,
    'system-b-table-sticky-header',
    'align-middle'
  ),
  stickyGroupHeader: cn(
    'sticky top-0',
    zIndex.groupHeader,
    'system-b-table-sticky-group-header'
  ),
  tableRow: cn(
    alignment.rowHeight,
    'system-b-table-row-shell',
    rowState.base,
    rowState.hover,
    rowState.focusWithin,
    'last:border-b-0'
  ),
  tableCell: cn(alignment.cellPadding, typography.cellPrimary, 'align-middle'),
  tableHeader: cn(alignment.headerPadding, typography.tableHeader, 'text-left'),
} as const;
