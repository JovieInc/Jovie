# Dashboard & Admin Layout Patterns

This document defines the standardized layout patterns for all dashboard and admin pages in the Jovie application.

## Core Principles

1. **Consistency**: All pages use the same structural pattern
2. **Accessibility**: Proper semantic HTML and ARIA attributes
3. **Responsiveness**: Mobile-first design with progressive enhancement
4. **Performance**: Zero layout shift (CLS < 0.1)

## Standard Page Structure

### Pattern 1: Full-Height Page with Table

Used for: Waitlist, Creators, Users, Audience, Contacts, Releases

```tsx
import { PageShell, PageHeader, PageContent } from '@/components/organisms/PageShell';

export default function MyTablePage() {
  return (
    <PageShell>
      <PageHeader
        title="Page Title"
        description="Optional description"
        action={<Button>Action</Button>}
      />
      <PageContent noPadding>
        <Table
          data={data}
          columns={columns}
          getRowId={(row) => row.id}
        />
      </PageContent>
    </PageShell>
  );
}
```

**Key Measurements**:
- Outer padding: `p-6` (from PageShell)
- Container: `rounded-lg` (8px radius)
- Header height: `h-14` (56px fixed)
- Header padding: `px-4 sm:px-6`
- Content area: `flex-1 min-h-0` (fills remaining space)

### Pattern 2: Scrollable Content Page

Used for: Settings pages, forms, content-heavy pages

```tsx
import { PageShell, PageHeader, PageContent } from '@/components/organisms/PageShell';

export default function MyContentPage() {
  return (
    <PageShell>
      <PageHeader
        title="Settings"
        description="Manage your preferences"
      />
      <PageContent>
        <div className="max-w-2xl space-y-6">
          {/* Form fields, cards, etc. */}
        </div>
      </PageContent>
    </PageShell>
  );
}
```

### Pattern 3: Dashboard Overview

Used for: Admin overview, dashboard home

```tsx
import { PageShell, PageHeader, PageContent } from '@/components/organisms/PageShell';

export default function DashboardPage() {
  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        action={<DateRangePicker />}
      />
      <PageContent>
        <div className="space-y-6">
          <MetricsCards />
          <RecentActivity />
          <UsageCharts />
        </div>
      </PageContent>
    </PageShell>
  );
}
```

## Component API

### PageShell

Provides the outer container with rounded corners and proper overflow handling.

**Props**:
- `children: ReactNode` - Page content
- `className?: string` - Additional CSS classes
- `noPadding?: boolean` - Removes outer p-6 padding

**CSS Classes Applied**:
```css
/* Outer wrapper */
h-full p-6

/* Inner container */
rounded-lg bg-surface-1 shadow-sm h-full overflow-hidden flex flex-col
```

### PageHeader

Standardized header with fixed height and responsive padding.

**Props**:
- `title: string` - Page title (required)
- `description?: string` - Optional subtitle
- `action?: ReactNode` - Action button/element
- `breadcrumbs?: ReactNode` - Breadcrumb navigation
- `mobileSidebarTrigger?: ReactNode` - Mobile menu button
- `sidebarTrigger?: ReactNode` - Desktop sidebar toggle
- `className?: string` - Additional CSS classes

**CSS Classes Applied**:
```css
h-14 shrink-0 border-b border-subtle px-4 sm:px-6
flex items-center justify-between gap-4
```

### PageContent

Scrollable content area that fills remaining vertical space.

**Props**:
- `children: ReactNode` - Content
- `className?: string` - Additional CSS classes
- `noPadding?: boolean` - Removes default p-6 padding

**CSS Classes Applied**:
```css
flex-1 min-h-0 overflow-auto p-6
```

## Layout Specifications

### Header Heights

- **Page Header**: 56px (`h-14`)
- **Table Header**: 48px (`h-12`)
- **Table Row**: 60px (fixed height for CLS prevention)
- **Toolbar**: 56px (when present)

### Spacing

- **Outer padding**: 24px (`p-6`)
- **Header horizontal**: 16px/24px (`px-4 sm:px-6`)
- **Content padding**: 24px (`p-6`) unless `noPadding`
- **Gap between sections**: 24px (`space-y-6`)

### Responsive Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px (`md:`)
- **Desktop**: > 1024px (`lg:`)

### Colors (Design Tokens)

- **Background**: `bg-surface-1`
- **Border**: `border-subtle`
- **Text primary**: `text-primary-token`
- **Text secondary**: `text-secondary-token`
- **Text tertiary**: `text-tertiary-token`

## Tables

### Standard Table Layout

All tables must use the unified table system:

```tsx
import { Table } from '@/components/organisms/table';

<Table
  data={rows}
  columns={columns}
  getRowId={(row) => row.id}
  selectable
  searchable
  pagination={pagination}
/>
```

### Table Features

- ✅ Fixed 60px row height (prevents layout shift)
- ✅ Keyboard navigation (arrows, spacebar, enter)
- ✅ Virtualization for large datasets (>50 rows)
- ✅ Responsive column hiding (`hideOnMobile`)
- ✅ Line-clamp text (prevents wrapping)
- ✅ Sticky headers
- ✅ Bulk actions
- ✅ Search and filtering

## Accessibility

### Requirements

1. **Semantic HTML**: Use proper heading hierarchy (h1 → h2 → h3)
2. **ARIA labels**: All interactive elements must have accessible names
3. **Keyboard navigation**: Full keyboard support (tab, enter, space, arrows)
4. **Focus management**: Visible focus indicators at all times
5. **Screen reader**: Proper announcements for dynamic content

### Example

```tsx
<PageHeader
  title="Waitlist"
  description="Manage creator signups"
/>

// Renders:
<header aria-label="Page header">
  <h1 className="text-sm font-semibold">Waitlist</h1>
  <p className="text-xs">Manage creator signups</p>
</header>
```

## Performance

### Zero Layout Shift

All components must maintain zero cumulative layout shift (CLS):

- ✅ Fixed header heights (`h-14`, `h-12`)
- ✅ Fixed row heights (`h-[60px]`)
- ✅ Loading skeletons match content dimensions
- ✅ Empty states have minimum heights (`min-h-[400px]`)
- ✅ Layout containment (`contain-layout`)

### Optimization Checklist

- [ ] Page uses `PageShell`, `PageHeader`, `PageContent`
- [ ] Table uses unified table system
- [ ] All heights are fixed (no auto)
- [ ] Loading states match real content
- [ ] Images have width/height attributes
- [ ] No render-blocking resources

## Migration Guide

### Before (Old Pattern)

```tsx
// ❌ Old: Inconsistent structure
export default function WaitlistPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="overflow-auto">
        <header className="py-4 sm:py-6">
          <h1>Waitlist</h1>
        </header>
        <div className="pb-4">
          <WaitlistTable />
        </div>
      </div>
    </div>
  );
}
```

### After (New Pattern)

```tsx
// ✅ New: Standardized structure
import { PageShell, PageHeader, PageContent } from '@/components/organisms/PageShell';

export default function WaitlistPage() {
  return (
    <PageShell>
      <PageHeader title="Waitlist" />
      <PageContent noPadding>
        <WaitlistTable />
      </PageContent>
    </PageShell>
  );
}
```

## Testing

### Visual Regression

- [ ] Header height is exactly 56px
- [ ] Rounded corners visible (8px radius)
- [ ] No horizontal scroll at any breakpoint
- [ ] No vertical whitespace at bottom

### Accessibility

- [ ] WAVE audit passes (0 errors)
- [ ] aXe DevTools audit passes
- [ ] Screen reader announces page title
- [ ] Keyboard navigation works (tab, enter)

### Performance

- [ ] Lighthouse CLS score < 0.1
- [ ] No layout shift during loading
- [ ] Table rows have fixed 60px height
- [ ] Loading skeleton matches content

## Examples

See implementations in:
- `/apps/web/app/app/admin/waitlist/page.tsx`
- `/apps/web/app/app/admin/creators/page.tsx`
- `/apps/web/app/app/dashboard/audience/page.tsx`

## Questions?

For questions or clarifications, see:
- **Plan file**: `/Users/timwhite/.claude/plans/iterative-sleeping-wall.md`
- **Table system**: `/apps/web/components/organisms/table/`
- **Design tokens**: `/apps/web/styles/design-system.css`
