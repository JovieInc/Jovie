/**
 * Public boundary for shared product components.
 *
 * Routes compose these exports (and @jovie/ui for cross-product primitives).
 * A route must not recreate a family listed in component-ownership.json.
 */

export { Banner, FeedbackProvider, toast } from '@/components/feedback';
export { JovieChat } from '@/components/jovie';
export {
  RightDrawer,
  type RightDrawerProps,
} from '@/components/molecules/drawer/RightDrawer';
export {
  EmptyState,
  type EmptyStateProps,
} from '@/components/molecules/EmptyState';
export {
  AppShellContentPanel,
  type AppShellContentPanelProps,
} from '@/components/organisms/AppShellContentPanel';
export {
  AppShellFrame,
  type AppShellFrameProps,
} from '@/components/organisms/AppShellFrame';
export { CommandPalette } from '@/components/organisms/CommandPalette';
export { DashboardErrorFallback } from '@/components/organisms/DashboardErrorFallback';
export {
  Dialog,
  DialogActions,
  DialogBody,
} from '@/components/organisms/Dialog';
export {
  HeaderNav,
  type HeaderNavProps,
} from '@/components/organisms/HeaderNav';
export {
  PageContent,
  PageHeader,
  type PageHeaderProps,
  PageShell,
  type PageShellProps,
} from '@/components/organisms/PageShell';
export type {
  UnifiedTableProps,
  UnifiedTableSkeletonProps,
} from '@/components/organisms/table';
export {
  UnifiedTable,
  UnifiedTableSkeleton,
} from '@/components/organisms/table';
export {
  AppShellRightRail,
  type AppShellRightRailProps,
} from '@/components/shell/AppShellRightRail';
export { JovieOverlay } from '@/components/shell/JovieOverlay';
