# Dashboard sidebar migration

## Executive summary
- **Unified shell**: The sidebar markup now lives in `components/dashboard/layout/DashboardSidebar.tsx`, wrapping shadcn/ui primitives with the exact Jovie navigation, footer actions, and Lucide-ready slots.
- **Composable top bar**: Header markup has been extracted into `DashboardTopBar.tsx` so future navigation, breadcrumbs, and action items can iterate independently of the shell.
- **Legacy clean-out**: Deprecated `components/ui/Sidebar.backup.tsx` has been removed to prevent regressions and confusion with the shadcn-based implementation.

## Before → after comparison
| Region | Previous state | Current state |
| --- | --- | --- |
| Sidebar container | Inline inside `DashboardLayoutClient` with duplicated header/footer markup | Dedicated `<DashboardSidebar />` component that encapsulates shadcn sidebar primitives |
| Header / breadcrumbs | Hardcoded `<header>` element inside the layout component | `<DashboardTopBar />` component exposing breadcrumb + optional action slots |
| Legacy backup component | `components/ui/Sidebar.backup.tsx` lingered in the tree | File deleted; only canonical sidebar primitives remain |

### Visual delta (described)
- **Before**: The layout component owned both sidebar and header markup, making Storybook extraction and prop-driven variations difficult. Updating sidebar copy required editing the layout directly.
- **After**: The shell composes via two focused components. The sidebar renders the same logo, navigation, and utility actions while remaining fully collapsible. The top bar continues to render breadcrumbs with the existing typography tokens and can accept future right-aligned actions without structural changes.

## Prop matrix
| Component | Props | Notes |
| --- | --- | --- |
| `DashboardSidebar` | `className`, plus any props accepted by `Sidebar` except `children` | Keeps variant fixed to `inset` for consistent theming. Exposes the existing nav, theme toggle, feedback CTA, and user menu. |
| `DashboardTopBar` | `breadcrumbs: DashboardBreadcrumbItem[]`, `actions?: ReactNode` | Breadcrumbs render identically to before; optional `actions` slot enables later migration tasks to add buttons without refactoring. |

## Integration checklist
- Import `{ DashboardSidebar }` and wrap it inside a `SidebarProvider` context.
- Pair the sidebar with `<SidebarInset>` to render `<DashboardTopBar />` and page content.
- Pass breadcrumb data from the layout (current implementation reuses the existing pathname parser).
- For additional header controls, pass them through the `actions` prop to keep alignment pristine.

## QA + verification
1. Load `/dashboard/overview` and confirm the sidebar collapses/expands exactly as before (state persistence still flows through `SidebarProvider`).
2. Validate the theme toggle, feedback CTA, and user menu continue to operate.
3. Resize to mobile: the sidebar slides over content using the same sheet pattern, and the top bar remains sticky.
4. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test:fast` to keep the dashboard regression-free.

## Follow-up opportunities
- Task 6 can now focus solely on navigation styling by updating `DashboardTopBar` without touching the sidebar shell.
- Task 7 can drop in a dedicated breadcrumbs component by replacing the inline rendering inside `DashboardTopBar`.
- After all migrations, Task 10 can remove any dead Storybook stories that referenced the backup sidebar.
