/**
 * Unified Admin Table Design Tokens & Styles
 * Inspired by Linear.app for clean visual hierarchy and polish
 */

// Typography Scale - Visual Hierarchy
export const typography = {
  tableHeader:
    'text-[11px] font-[510] text-tertiary-token uppercase tracking-[0.08em] line-clamp-1',
  cellPrimary: 'text-[13px] font-[510] text-primary-token', // Main content
  cellSecondary: 'text-[13px] text-secondary-token', // Supporting info
  cellTertiary: 'text-xs text-tertiary-token', // Metadata, timestamps
  rowNumber: 'text-[13px] tabular-nums text-tertiary-token', // Monospace numbers
  groupHeader: 'text-[13px] font-[590] text-primary-token', // Group headers
} as const;

// Alignment & Spacing - Perfect Vertical Alignment
export const alignment = {
  checkboxCell: 'flex items-center justify-center', // Center checkbox
  numberCell: 'flex items-center justify-end tabular-nums', // Right-align numbers
  rowHeight: '34px', // Fixed height for consistent alignment (Linear compact standard)
  cellPadding: 'px-4 py-2', // Consistent padding for cells
  headerPadding: 'px-4 py-1.5', // Compact padding for headers
  checkboxSize: 'h-3.5 w-3.5', // 14px checkbox
} as const;

// Row Selection Colors — aligned with Linear design tokens
export const selection = {
  unchecked:
    'hover:bg-(--linear-row-hover) focus-within:bg-(--linear-row-hover) transition-[background-color,box-shadow] duration-150',
  checked:
    'bg-(--linear-row-selected) hover:bg-(--linear-row-selected) focus-within:bg-(--linear-row-selected)',
  selected: 'bg-(--linear-row-selected)',
  hover: 'hover:bg-(--linear-row-hover)',
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
  fast: 'transition-colors duration-100 ease-out',
  standard: 'transition-colors duration-150 ease-out',
  slow: 'transition-colors duration-300 ease-out',
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
  rowHeight: '34px',
  headerHeight: '30px', // Compact header with py-1.5 padding
  toolbarHeight: '56px',
  footerHeight: '52px',
  emptyStateMinHeight: '400px',
  skeletonRowHeight: '34px', // Must match rowHeight
} as const;

// Border Styles
export const borders = {
  cell: 'border-b border-(--linear-border-subtle)',
  header: 'border-b border-(--linear-border-subtle)',
  groupHeader: 'border-b-2 border-(--linear-border-subtle)',
  subtle: 'border-(--linear-border-subtle)',
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
    'bg-(--linear-app-content-surface)',
    'shadow-[inset_0_-1px_0_var(--linear-border-subtle)]'
  ),
  stickyGroupHeader: cn(
    'sticky top-0',
    zIndex.groupHeader,
    'bg-(--linear-app-content-surface)',
    borders.groupHeader
  ),
  tableRow: cn(
    alignment.rowHeight,
    borders.cell,
    selection.unchecked,
    'last:border-b-0',
    'focus-within:shadow-[inset_0_0_0_1px_var(--linear-border-focus)]'
  ),
  tableCell: cn(alignment.cellPadding, typography.cellPrimary),
  tableHeader: cn(alignment.headerPadding, typography.tableHeader, 'text-left'),
} as const;
