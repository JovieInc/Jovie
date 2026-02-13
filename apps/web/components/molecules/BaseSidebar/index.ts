/**
 * BaseSidebar
 *
 * A composable sidebar component with shared state management,
 * keyboard handling, and responsive behavior.
 *
 * @example
 * ```tsx
 * import { BaseSidebar, BaseSidebarHeader, BaseSidebarContent } from '@/components/molecules/BaseSidebar';
 *
 * <BaseSidebar isOpen={isOpen} onClose={onClose} position="right">
 *   <BaseSidebarHeader onClose={onClose}>
 *     <h2>Sidebar Title</h2>
 *   </BaseSidebarHeader>
 *   <BaseSidebarContent>
 *     <p>Sidebar content goes here</p>
 *   </BaseSidebarContent>
 * </BaseSidebar>
 * ```
 */

export {
  BaseSidebar,
  BaseSidebarContent,
  BaseSidebarFooter,
  BaseSidebarHeader,
} from './BaseSidebar';

export type {
  BaseSidebarContentProps,
  BaseSidebarFooterProps,
  BaseSidebarHeaderProps,
  BaseSidebarProps,
  SidebarPosition,
} from './types';

export { useSidebarEscapeKey } from './useSidebarEscapeKey';
