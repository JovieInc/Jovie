/**
 * Canonical profile shell — public surface rendering stack.
 *
 * This directory is the single point of truth for what comprises the
 * profile rendering shell. All imports of profile shell components should
 * go through this barrel.
 *
 * Canonical stack (top-level, rendering order):
 *
 *   ProfileCompactTemplate   — layout, background, mobile/desktop split,
 *                               URL↔mode sync, drawer state, safe-area
 *   │
 *   ├─ ProfileCompactSurface  — mobile/tablet surface, bottom tab bar
 *   │                           placement, scroll container
 *   │
 *   └─ ProfileDesktopSurface  — desktop surface (lazy-loaded via dynamic())
 *
 * Named rendering states (§1.5 of spec):
 *   - Loading    → ProfileSkeleton (in ProfileCompactSurface)
 *   - Empty      → resolveEmptyState (in profile-surface-state.ts)
 *   - Error      → ProfileError / PublicPageErrorFallback (in error.tsx)
 *   - Content    → ProfileCompactSurface / ProfileDesktopSurface
 *
 * Route config: apps/web/lib/profile/route-config.ts
 * Spec:         docs/public-profile-surface-spec.md
 * Audit:        docs/public-profile-hardening-audit.md
 *
 * DO NOT add components to this directory that are not part of the
 * canonical shell rendering stack. Feature components (drawers, forms,
 * CTAs) live in the parent features/profile directory.
 */

// Mobile/tablet surface — renders the bottom tab bar, scroll containers,
// hero identity block, and tab panel content.
export { ProfileCompactSurface } from '../templates/ProfileCompactSurface';
// Surface router — owns the compact/desktop split and URL↔mode sync.
// Entry point for StaticArtistPage.
export { ProfileCompactTemplate } from '../templates/ProfileCompactTemplate';

// Desktop surface — sidebar panel layout for viewports > 1180px.
// Loaded lazily via dynamic() in ProfileCompactTemplate.
export { ProfileDesktopSurface } from '../templates/ProfileDesktopSurface';
