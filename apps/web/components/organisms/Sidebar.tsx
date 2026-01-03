'use client';

/**
 * Sidebar Component
 *
 * @deprecated This file is maintained for backwards compatibility.
 * Import from '@/components/organisms/sidebar' for new code.
 *
 * A comprehensive sidebar component system with support for:
 * - Responsive behavior (mobile sheet, desktop collapsible)
 * - Keyboard shortcuts
 * - Multiple variants (sidebar, floating, inset)
 * - Collapsible modes (offcanvas, icon, none)
 * - Menu system with tooltips, badges, and actions
 */

// Re-export everything from the modular structure for backwards compatibility
export {
  Sidebar,
  SidebarContent,
  SidebarContext,
  type SidebarContextValue,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
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
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarShortcutHint,
  SidebarTrigger,
  useSidebar,
} from './sidebar/index';
