/**
 * Unified Admin Table Design Tokens & Styles
 * Inspired by Linear.app for clean visual hierarchy and polish
 */

// Typography Scale - Visual Hierarchy
export const typography = {
  tableHeader:
    'text-xs font-semibold uppercase tracking-wide text-tertiary-token line-clamp-1',
  cellPrimary: 'text-[13px] font-medium text-primary-token', // Main content
  cellSecondary: 'text-[13px] text-secondary-token', // Supporting info
  cellTertiary: 'text-xs text-tertiary-token', // Metadata, timestamps
  rowNumber: 'text-xs tabular-nums text-tertiary-token', // Monospace numbers
  groupHeader: 'text-sm font-semibold text-primary-token', // Group headers
} as const;

// Alignment & Spacing - Perfect Vertical Alignment
export const alignment = {
  checkboxCell: 'flex items-center justify-center', // Center checkbox
  numberCell: 'flex items-center justify-end tabular-nums', // Right-align numbers
  rowHeight: '52px', // Fixed height for consistent alignment
  cellPadding: 'px-4 py-3', // Consistent padding
  checkboxSize: 'h-4 w-4', // 16px checkbox
} as const;

// Row Selection Colors
export const selection = {
  unchecked: 'hover:bg-surface-2/50 transition-colors',
  checked: 'bg-surface-2/70 hover:bg-surface-2',
  selected: 'bg-primary/5 border-l-2 border-primary',
  hover: 'hover:bg-surface-2/50',
} as const;

// Z-Index Layers
export const zIndex = {
  toolbar: 'z-30',
  groupHeader: 'z-25',
  tableHeader: 'z-20',
  rows: 'z-10',
} as const;

// Transition Timings (ease-out only)
export const transitions = {
  fast: 'transition-all duration-100 ease-out',
  standard: 'transition-all duration-200 ease-out',
  slow: 'transition-all duration-300 ease-out',
} as const;

// Column Widths (Standard)
export const columnWidths = {
  checkbox: 'w-14', // 56px
  avatar: 'w-12', // 48px
  small: 'w-[120px]',
  medium: 'w-[160px]',
  large: 'w-[200px]',
  xlarge: 'w-[320px]',
  actions: 'w-[140px]',
} as const;

// Layout Stability - Fixed Heights to Prevent Layout Shift
export const layoutStability = {
  rowHeight: '52px',
  headerHeight: '44px',
  toolbarHeight: '56px',
  footerHeight: '52px',
  emptyStateMinHeight: '400px',
  skeletonRowHeight: '52px', // Must match rowHeight
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
  base: 'animate-pulse bg-surface-2 rounded',
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
    'bg-surface-1',
    borders.header
  ),
  stickyGroupHeader: cn(
    'sticky top-0',
    zIndex.groupHeader,
    'bg-base dark:bg-surface-2',
    borders.groupHeader
  ),
  tableRow: cn(
    alignment.rowHeight,
    borders.cell,
    selection.unchecked,
    'last:border-b-0'
  ),
  tableCell: cn(alignment.cellPadding, typography.cellPrimary),
  tableHeader: cn(alignment.cellPadding, typography.tableHeader, 'text-left'),
} as const;
