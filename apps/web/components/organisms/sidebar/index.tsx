'use client';

/**
 * Sidebar Component Module
 *
 * A comprehensive sidebar component system with support for:
 * - Responsive behavior (mobile sheet, desktop collapsible)
 * - Keyboard shortcuts
 * - Multiple variants (sidebar, floating, inset)
 * - Collapsible modes (offcanvas, icon, none)
 * - Menu system with tooltips, badges, and actions
 */

export type { SidebarContextValue } from './context';
// Context and Provider
export { SidebarContext, SidebarProvider, useSidebar } from './context';
// Controls
export { SidebarRail, SidebarShortcutHint, SidebarTrigger } from './controls';
// Group Components
export {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from './group';

// Layout Components
export {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarSeparator,
} from './layout';
// Menu Components
export {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuActions,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from './menu';
// Main Sidebar
export { Sidebar } from './sidebar';
