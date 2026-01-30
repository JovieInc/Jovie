# Top Performance Issues Report

This document identifies the top performance issues found in the codebase, prioritized by impact.

## 🔴 Critical Issues

### 1. Missing Database Indexes

**Impact**: Slow database queries, especially as data grows
**Location**: `db_indexes.md`
**Details**:

- Featured creators query performs full table scans without proper indexes
- Query uses compound WHERE clause: `is_public = true AND is_featured = true AND marketing_opt_out = false`
- Missing composite index: `idx_creator_profiles_featured_query`
- **Expected improvement**: 10-100x faster query execution

### 2. Expensive findIndex Operations in Render

**Impact**: O(n) operations executed on every render for large lists
**Location**:

- `components/dashboard/organisms/GroupedLinksManager.tsx:975`
- `components/dashboard/organisms/GroupedLinksManager.tsx:336, 410`

**Issue**:

```tsx
index={links.findIndex(l => l.normalizedUrl === link.normalizedUrl)}
```

This runs for every link in every render. With 50+ links, this creates significant overhead.

**Fix**: Create a Map/index outside render or memoize the index calculation.

### 3. Missing React.memo on Frequently Re-rendered Components

**Impact**: Unnecessary re-renders cascading through component tree
**Locations**:

- `components/home/HomeHero.tsx` - No memoization
- `components/organisms/HeroSection.tsx` - No memoization, processes headline on every render
- `components/organisms/FeaturedArtistsSection.tsx` - No memoization
- `components/organisms/BillingDashboard.tsx` - No memoization

**Issue**: These components re-render when parent state changes even when props haven't changed.

### 4. useEffect Dependency Array Issues

**Impact**: Infinite loops or unnecessary effect re-runs
**Location**: `components/organisms/BillingDashboard.tsx:68-70`

**Issue**:

```tsx
const fetchBillingInfo = useCallback(async () => {
  // ...
}, [notifyError]); // notifyError might change on every render

useEffect(() => {
  fetchBillingInfo();
}, [fetchBillingInfo]); // This runs every time notifyError changes
```

**Fix**: Extract stable references or use refs for functions that don't need to be dependencies.

## 🟡 High Priority Issues

### 5. Expensive Computations in Render (HeroSection)

**Impact**: String processing on every render
**Location**: `components/organisms/HeroSection.tsx:48-62`

**Issue**:

```tsx
const processedHeadline =
  highlightText && typeof headline === "string"
    ? headline.split(highlightText).reduce((acc, part, index, array) => {
        // Complex array manipulation on every render
      }, [])
    : headline;
```

**Fix**: Memoize with `useMemo` since `headline` and `highlightText` are likely stable props.

### 6. Large Lists Without Virtualization

**Impact**: Rendering all DOM nodes at once causes slow initial render and scrolling
**Locations**:

- `components/dashboard/organisms/DashboardAudienceTable.tsx` - Renders all table rows
- `components/dashboard/organisms/GroupedLinksManager.tsx` - Renders all links without virtualization
- `components/admin/WaitlistTable.tsx` - Renders all entries
- `components/organisms/FeaturedArtistsSection.tsx` - Could have many creators

**Issue**: These components render the entire list to DOM, causing performance issues with 50+ items.

**Fix**: Implement react-window or react-virtualized for tables/lists with many items.

### 7. Polling Intervals Not Optimized

**Impact**: Unnecessary network requests and re-renders
**Location**: `components/dashboard/organisms/EnhancedDashboardLinks.tsx:646-685`

**Issue**:

- Polling continues even when tab is hidden (has visibility check but could be optimized)
- Multiple components may be polling simultaneously
- No exponential backoff on errors

**Fix**:

- Use Page Visibility API to pause polling
- Implement shared polling manager
- Add exponential backoff

### 8. Over-memoization with Unstable Dependencies

**Impact**: useMemo/useCallback create new values anyway, defeating purpose
**Location**: `components/atoms/OptimizedImage.tsx:154-211`

**Issue**:

```tsx
const { defaultSizes, containerClasses, imageProps } = useMemo(() => {
  // ... computation
}, [
  // ...
  isLoading, // ❌ State that changes frequently
  // ...
]);
```

**Fix**: Extract stable parts from `imageProps` object, create separately memoized pieces.

### 9. Missing Lazy Loading for Heavy Components

**Impact**: Large initial bundle, slow time-to-interactive
**Locations**:

- Dashboard components loaded eagerly
- Admin components not code-split
- Analytics/monitoring components always loaded

**Issue**: Components like `PerformanceDashboard`, admin tables, analytics charts are loaded even when not used.

**Fix**: Use `next/dynamic` with lazy loading for:

- Admin panels
- Analytics dashboards
- Heavy data visualization components

### 10. Complex Sorting/Filtering in Render

**Impact**: O(n log n) operations on every render
**Location**: `components/dashboard/organisms/GroupedLinksManager.tsx:947-953`

**Issue**:

```tsx
const items = groupItems
  .slice() // Creates new array
  .sort(
    (a, b) => popularityIndex(a.platform.id) - popularityIndex(b.platform.id)
  ); // O(n log n)
```

**Fix**: Memoize sorted arrays with stable dependencies.

## 🟢 Medium Priority Issues

### 11. Missing Request Deduplication

**Impact**: Duplicate API calls for same data
**Locations**: Multiple components fetching the same data independently

**Issue**: Components like `BillingDashboard`, analytics hooks, and profile data fetchers don't dedupe concurrent requests.

**Fix**: Implement request deduplication using SWR or React Query pattern.

### 12. Large Bundle Chunks

**Impact**: Slow initial page load
**Location**: `next.config.js` - Bundle splitting config

**Issue**:

- `maxSize: 200000` (200KB) is quite large
- Charts, icons, motion libraries could be further split
- Some vendor chunks may exceed optimal size

**Fix**:

- Reduce maxSize to 150KB or less
- Create more granular chunk splitting
- Use dynamic imports for heavy libraries

### 13. Unoptimized Image Loading

**Impact**: Slow LCP, poor Core Web Vitals
**Locations**:

- Multiple image sources not using Next.js Image component
- Missing priority flags on above-the-fold images
- No srcset optimization in some cases

**Fix**:

- Audit all `<img>` tags, convert to `<Image>`
- Add `priority` to hero images
- Ensure proper `sizes` attributes

### 14. Third-Party Script Loading

**Impact**: Blocking render, affects FCP
**Location**: `app/layout.tsx`, `components/providers/ClientProviders.tsx`

**Issue**: Multiple third-party scripts load synchronously:

- Clerk
- Statsig
- Vercel Analytics
- Sentry

**Fix**:

- Defer non-critical scripts
- Load analytics after page load
- Use script `strategy` prop in Next.js

### 15. Expensive CSS-in-JS Calculations

**Impact**: Layout thrashing during render
**Location**: Components using dynamic style calculations

**Issue**: Some components compute styles inline, causing recalculations.

**Fix**: Move to CSS classes or memoize style objects.

## 📊 Performance Metrics to Monitor

### Current Optimizations (Good)

✅ Image optimization with Next.js Image
✅ Bundle code splitting configured
✅ Some memoization in place (OptimizedImage, Combobox)
✅ Database query consolidation (analytics queries)
✅ Request debouncing in search

### Areas Needing Attention

❌ React component memoization coverage
❌ List virtualization
❌ Database indexing
❌ Bundle size optimization
❌ Third-party script loading strategy

## 🎯 Recommended Action Plan

### Phase 1 (Immediate - High Impact)

1. Add database indexes for featured creators query
2. Fix findIndex in GroupedLinksManager render
3. Add React.memo to HomeHero, HeroSection, FeaturedArtistsSection
4. Memoize HeroSection headline processing

### Phase 2 (Short-term)

5. Implement virtualization for DashboardAudienceTable
6. Optimize polling in EnhancedDashboardLinks
7. Fix BillingDashboard useEffect dependencies
8. Extract and memoize sorted/filtered arrays

### Phase 3 (Medium-term)

9. Lazy load admin and analytics components
10. Implement request deduplication
11. Optimize bundle chunk sizes
12. Audit and optimize all image loading

### Phase 4 (Long-term)

13. Review third-party script loading strategy
14. Implement comprehensive performance monitoring
15. Set up performance budgets and alerts

## 📝 Notes

- Many components already have good optimization patterns (OptimizedImage, Combobox)
- Database query optimization has been addressed in analytics (good example to follow)
- Consider implementing React Query or SWR for better data fetching patterns
- Regular bundle analysis should be part of CI/CD pipeline
