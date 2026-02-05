# Atomic Design Violations Audit Report

**Date:** 2026-02-05
**Auditor:** Claude AI
**Branch:** `claude/audit-atomic-design-VTHt3`

---

## Executive Summary

The Jovie codebase has a **well-documented atomic design system** defined in `/architecture/COMPONENTS.md`, but implementation enforcement is inconsistent. This audit identified **13 atoms violating the "zero business logic" principle** by using React hooks.

| Metric | Count |
|--------|-------|
| Total Atomic Directories | 16 |
| Atoms with Hook Violations | 13 |
| Critical Severity | 5 |
| Medium Severity | 8 |

---

## Atomic Design Principles (Per COMPONENTS.md)

### Atoms Must Have

- Zero business logic
- Props-driven behavior
- ForwardRef for DOM elements
- DisplayName for debugging

### Atoms Must NOT Use

- `useState`, `useEffect`, `useQuery`, `useMutation`
- `useAuth`, `useCallback`, `useRef`, `useMemo`
- External API calls or feature dependencies

---

## Critical Violations (5 Components)

### 1. `/apps/web/components/atoms/OptimizedImage.tsx`

**Severity:** CRITICAL
**Hooks Used:** useState, useEffect, useMemo, useCallback, useRef + custom hooks

```typescript
// Current (Violation)
const OptimizedImage = React.memo(function OptimizedImage({...}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const renderCount = useRef(0);
  const imageSrc = useOptimizedImageSource({...});
  const { computedAlt, ...} = useOptimizedImageComputedValues({...});
  const handleLoad = useCallback(() => {...}, []);
  const handleError = useCallback(() => {...}, []);
  const { defaultSizes, containerClasses } = useMemo(() => {...}, [...]);
  useEffect(() => { /* debug logic */ }, [...]);
})
```

**Recommendation:** Move to `molecules/ImageDisplay.tsx`

---

### 2. `/apps/web/components/atoms/Avatar/Avatar.tsx`

**Severity:** CRITICAL
**Hooks Used:** useState, useMemo

```typescript
// Current (Violation)
export const Avatar = React.memo(function Avatar({...}) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const blurDataURL = useMemo(() => {...}, [width]);
  // Has image error handling, fallback initials, verified badge
})
```

**Recommendation:** Split into:
- `atoms/Avatar.tsx` - Simple avatar display (props only)
- `molecules/AvatarWithFallback.tsx` - Handles loading/error states

---

### 3. `/apps/web/components/atoms/QRCode.tsx`

**Severity:** CRITICAL
**Hooks Used:** useState, useEffect, useMemo
**Issue:** External API integration

```typescript
// Current (Violation)
export function QRCode({...}) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const qrUrl = useMemo(() => getQrCodeUrl(...), []); // External API call
  useEffect(() => { /* Reset state */ }, [...]);
  // Calls: https://api.qrserver.com/v1/create-qr-code/
}
```

**Recommendation:** Move to `molecules/QRCodeDisplay.tsx`

---

### 4. `/apps/web/components/atoms/DashboardErrorFallback.tsx`

**Severity:** CRITICAL
**Hooks Used:** useState, useRouter
**Issue:** Router navigation, Sentry integration, clipboard access

**Recommendation:** Move to `organisms/DashboardErrorBoundary.tsx`

---

### 5. `/apps/web/components/atoms/ErrorBoundary.tsx`

**Severity:** CRITICAL
**Hooks Used:** useEffect, useState, useRouter
**Issue:** Error reporting, Sentry integration, navigation logic

**Recommendation:** Move to `organisms/ErrorBoundaryProvider.tsx`

---

## Medium Violations (8 Components)

| File | Hooks Used | Recommendation |
|------|-----------|----------------|
| `atoms/ProfileNavButton.tsx` | useState | Move to `molecules/ProfileNavigation.tsx` |
| `atoms/AmountSelector.tsx` | useCallback | Refactor to props-driven |
| `atoms/ProgressIndicator.tsx` | useMemo | Use computed props instead |
| `atoms/SocialIcon.tsx` | hooks | Review and simplify |
| `atoms/TruncatedText.tsx` | hooks | Review and simplify |
| `atoms/CopyableMonospaceCell.tsx` | hooks | Move to molecule if state required |
| `atoms/TableErrorFallback.tsx` | hooks | Review severity |
| `atoms/AvatarUploadOverlay.tsx` | hooks | Review severity |

---

## Architectural Observations

### Positive Patterns

1. **Clear Global Atomic Hierarchy**
   - `/apps/web/components/atoms/`
   - `/apps/web/components/molecules/`
   - `/apps/web/components/organisms/`

2. **Feature-Scoped Components**
   - Dashboard, Admin, Auth have own atoms/molecules/organisms
   - Good separation of concerns

3. **Shared UI Package** (`/packages/ui/`)
   - Properly isolated shared components
   - Includes tests and Storybook stories

4. **Comprehensive Documentation**
   - `COMPONENTS.md` clearly defines rules
   - data-testid strategy documented

### Issues & Inconsistencies

1. **Nested Atomic Structures**

   ```text
   /components/organisms/table/
   ├── atoms/      # 3-level nesting
   ├── molecules/
   └── organisms/
   ```

   Unclear if these should be promoted to global atoms.

2. **Non-Atomic Directories**
   - `/components/hooks/`
   - `/components/effects/`
   - `/components/bridge/`
   - These don't follow atomic design principles.

3. **Legacy UI Directory**
   - `/components/ui/` overlaps with `/packages/ui/`
   - Contains mix of migrated/legacy components

---

## Recommended Action Plan

### Phase 1: Critical Refactoring

| Current Location | New Location | Priority |
|------------------|--------------|----------|
| `atoms/OptimizedImage.tsx` | `molecules/ImageDisplay.tsx` | P0 |
| `atoms/Avatar/Avatar.tsx` | `molecules/AvatarWithFallback.tsx` | P0 |
| `atoms/QRCode.tsx` | `molecules/QRCodeDisplay.tsx` | P0 |
| `atoms/DashboardErrorFallback.tsx` | `organisms/DashboardErrorBoundary.tsx` | P0 |
| `atoms/ErrorBoundary.tsx` | `organisms/ErrorBoundaryProvider.tsx` | P0 |

### Phase 2: Medium-Priority Refactoring

1. Refactor `ProfileNavButton.tsx` to molecule
2. Simplify `AmountSelector.tsx` (remove useCallback)
3. Review remaining 6 medium-severity violations

### Phase 3: Documentation & Tooling

1. Add ESLint rule to detect hooks in atoms:

   ```javascript
   // .eslintrc.js
   rules: {
     'no-restricted-imports': ['error', {
       paths: [
         {
           name: 'react',
           importNames: ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef'],
           message: 'Atoms should not use React hooks. Move to molecules/organisms.'
         }
       ]
     }]
   }
   ```

   (Apply only to `**/atoms/**/*.tsx` files)

2. Document nested atomic structure guidelines
3. Create migration guide for atoms → molecules

---

## Files Requiring Changes

### Critical (5 files)

- `/apps/web/components/atoms/OptimizedImage.tsx`
- `/apps/web/components/atoms/Avatar/Avatar.tsx`
- `/apps/web/components/atoms/QRCode.tsx`
- `/apps/web/components/atoms/DashboardErrorFallback.tsx`
- `/apps/web/components/atoms/ErrorBoundary.tsx`

### Medium (8 files)

- `/apps/web/components/atoms/ProfileNavButton.tsx`
- `/apps/web/components/atoms/AmountSelector.tsx`
- `/apps/web/components/atoms/ProgressIndicator.tsx`
- `/apps/web/components/atoms/SocialIcon.tsx`
- `/apps/web/components/atoms/TruncatedText.tsx`
- `/apps/web/components/atoms/CopyableMonospaceCell.tsx`
- `/apps/web/components/atoms/TableErrorFallback.tsx`
- `/apps/web/components/atoms/AvatarUploadOverlay.tsx`

---

## Conclusion

The Jovie codebase has solid atomic design foundations with clear documentation, but **enforcement is inconsistent**. The primary issue is 13 atoms improperly using React hooks that violate the "zero business logic" principle.

**Recommended next steps:**
1. Prioritize moving the 5 critical violations to appropriate levels
2. Add ESLint rules to prevent future violations
3. Update documentation to cover edge cases

---

*This audit was generated automatically. Review recommendations before implementing changes.*
