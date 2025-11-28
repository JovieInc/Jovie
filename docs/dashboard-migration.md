# Dashboard UI Inventory and Migration Matrix

## Component Inventory

| File Path | Component(s) | Purpose | Duplicates | Issues |
|-----------|--------------|---------|------------|--------|
| `app/dashboard/layout.tsx` | `DashboardLayoutClient` | Server layout wrapper securing routes and loading data | Uses legacy `Button`, `Sidebar` | Inconsistent tokens, manual error UI |
| `app/dashboard/DashboardLayoutClient.tsx` | `Sidebar`, `Button`, `Tooltip`, `DashboardNav`, `EnhancedThemeToggle`, `FeedbackButton`, `UserButton` | Client shell with navigation and utilities | Multiple button and tooltip variants | Heavy client JS; duplicate components; mixed accessibility |
| `app/dashboard/overview/page.tsx` | `DashboardOverview` | Overview metrics | Relies on custom card and table components | Styling drift, limited a11y checks |
| `app/dashboard/analytics/page.tsx` | `DashboardAnalytics` | Analytics charts | Custom chart wrappers | Client-only charts not lazy-loaded |
| `app/dashboard/audience/page.tsx` | `DashboardAudience` | Audience statistics | Reuses chart and table implementations | Duplicated loading states |
| `app/dashboard/links/page.tsx` | `EnhancedDashboardLinks` | Manage profile links | Custom form controls and modals | Mixed component styles; multiple form inputs |
| `app/dashboard/settings/page.tsx` | `DashboardSettings` | Account and profile settings | Various bespoke form fields | Inconsistent validation UX |
| `app/dashboard/tipping/page.tsx` | `DashboardTipping` | Tipping configuration | Custom buttons, inputs | Lacks keyboard shortcuts; inconsistent tokens |

## Component Migration Matrix

| Existing Component(s) | New Primitive | Atomic Layer | Notes |
|-----------------------|--------------|--------------|-------|
| `components/ui/Button`, `components/ui/CTAButton`, `components/ui/FrostedButton`, `components/molecules/LoadingButton` | `packages/ui/atoms/Button` | Atom | Consolidate all button variants into token-driven `Button` built on shadcn/Radix |
| `components/atoms/Tooltip` | `packages/ui/atoms/Tooltip` (Radix) | Atom | Replace custom tooltip with Radix Tooltip for a11y and portal handling |
| `components/ui/Sidebar`, `components/dashboard/DashboardNav` | `packages/ui/organisms/Sidebar` | Organism | Single responsive sidebar with collapsible behaviour |
| `components/molecules/UserButton` | `@clerk/nextjs` shadcn wrapper | Atom | Theme Clerk `UserButton` to tokens; remove custom styling |
| `components/dashboard/organisms/EnhancedDashboardLinks` | `packages/ui/templates/LinksManager` | Template | Built from standard atoms/molecules; remove bespoke forms |
| `components/dashboard/DashboardAnalytics` and chart wrappers | `packages/ui/organisms/AnalyticsCharts` (lazy loaded) | Organism | Use dynamic import for charts; standard loading skeleton |

## Design Tokens

The token definitions live in `styles/globals.css` where light and dark CSS custom properties are declared. The `packages/ui/theme/tokens.ts` file maps those variables to Tailwind v4 tokens for use across components.
