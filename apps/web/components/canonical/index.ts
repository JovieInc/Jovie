/**
 * Public boundary for shared product components.
 *
 * Routes compose these exports (and @jovie/ui for cross-product primitives).
 * A route must not recreate a family listed in component-ownership.json.
 */
export {
  AppShellContentPanel,
  type AppShellContentPanelProps,
} from '@/components/organisms/AppShellContentPanel';
export {
  AppShellFrame,
  type AppShellFrameProps,
} from '@/components/organisms/AppShellFrame';
export {
  AppShellRightRail,
  type AppShellRightRailProps,
} from '@/components/shell/AppShellRightRail';
export {
  PageContent,
  PageHeader,
  PageShell,
  type PageHeaderProps,
  type PageShellProps,
} from '@/components/organisms/PageShell';
export { HeaderNav, type HeaderNavProps } from '@/components/organisms/HeaderNav';
export { Dialog, DialogActions, DialogBody } from '@/components/organisms/Dialog';
export {
  RightDrawer,
  type RightDrawerProps,
} from '@/components/molecules/drawer/RightDrawer';
export { CommandPalette } from '@/components/organisms/CommandPalette';
export { JovieChat } from '@/components/jovie';
export {
  EmptyState,
  type EmptyStateProps,
} from '@/components/molecules/EmptyState';
export { DashboardErrorFallback } from '@/components/organisms/DashboardErrorFallback';
export { Banner, FeedbackProvider, toast } from '@/components/feedback';
export { JovieOverlay } from '@/components/shell/JovieOverlay';
export {
  UnifiedTable,
  UnifiedTableSkeleton,
} from '@/components/organisms/table';
export type {
  UnifiedTableProps,
  UnifiedTableSkeletonProps,
} from '@/components/organisms/table';
