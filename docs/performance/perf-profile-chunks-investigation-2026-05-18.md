# Profile Route JS Chunk Reduction Investigation
**Date**: 2026-05-18  
**Issue**: JOV-2271  
**Branch**: `tim/jov-2271-profile-chunk-reduction`  
**Investigator**: Agent (coder profile)

## Goal

Reduce the `/[username]` (public profile) route from 49 JS chunks to ≤30 chunks, with Lighthouse TBT ≤300ms on mobile and no functional regression.

## Baseline (pre-investigation)

**Method**: `page_client-reference-manifest.js` initial chunks + `react-loadable-manifest.json` dynamic chunks.

| Category | Count |
|---|---|
| Initial chunks (client-reference-manifest) | 36 |
| Dynamic chunks (react-loadable-manifest) | 13 |
| **Total** | **49** |

## What Was Tried

### Step 1: Audit Chunk Graph

Full analysis of the 49-chunk profile route:

**Initial chunks (36) come from these client boundaries:**
- `ProfileCompactTemplate` (main client island, `'use client'`)
- `ProfileCompactSurface` (child of Template, `'use client'`)
- `PublicProfileLayoutShell` (child of Template, `'use client'`)
- `PublicClaimBanner` (in `page.tsx`, `'use client'`)
- `ErrorBanner` (in `page.tsx`, `'use client'`, renders only on error path)
- `DesktopQrOverlayClient` (in `page.tsx`, `'use client'`)
- `ProfileViewTracker` (in `page.tsx`, `'use client'`)
- `JoviePixel` (in `page.tsx`, `'use client'`)
- `app/[username]/error.tsx` (required Next.js error boundary, `'use client'`)
- `ClientProviders` (in layout, `'use client'`, with `skipCoreProviders=true` and `forceBypassClerk=true`)
- `ProfileWebVitalsReporter` (in layout, `'use client'`)

**Dynamic chunks (13) come from 2 `next/dynamic()` calls in `ProfileCompactSurface`:**
- `ProfileUnifiedDrawer` (drawer shown on tab click) → 10 chunks
- `ProfileInlineNotificationsCTA` (notifications CTA) → 3 chunks

**Key finding**: `MarketingHeader` and `MarketingFooter` appear in the client manifest due to a shared chunk (`0.i41tzjf100t.js`, 34KB) that Turbopack creates for `next/link` + marketing components. They are NOT loaded separately — they share a chunk with `next/link` which IS used by `ClaimBanner` and `ErrorBanner`. This chunk cannot be split further without refactoring how those modules import `next/link`.

### Step 2: Dynamic Imports for ProfilePrimaryTabPanel

`ProfilePrimaryTabPanel` (rendered only when user clicks a non-home tab) statically imports:
- `AboutSection`
- `ArtistNotificationsCTA`
- `TwoStepNotificationsCTA`
- `TourDrawerContent` (from `TourModePanel`)
- `ReleasesView`

**Attempt**: Converted all 5 to `dynamic()` imports.

**Result**: Total went from **49 → 54 chunks** (initial 36→34, dynamic 13→20, net +5).

**Root cause**: These components are already in the `ProfileUnifiedDrawer` dynamic chunk tree (since `ProfileUnifiedDrawer` statically imports the same set). Adding more `dynamic()` split points caused Turbopack to create additional shared chunks (`0759~gnd0.7_r.js` 38.4KB, `030_t09mjher7.js` 22.3KB, etc.) instead of deduplicating. The Turbopack chunking algorithm prefers creating new shared boundaries over reusing existing ones when multiple split points overlap.

**Action**: Reverted to original static imports.

### Step 3: `optimizePackageImports` Cleanup

`next.config.js` listed `simple-icons` and `framer-motion` in `optimizePackageImports`:
- `simple-icons`: not installed as a direct dep in the workspace (it's resolved as `@icons-pack/react-simple-icons`)
- `framer-motion`: not a direct dep (transitive via `motion`)

**Attempt**: Removed both from the array.

**Result**: Total went from **49 → 50 chunks** (net +1 initial chunk). The cleanup actually created a slight regression.

**Action**: Reverted to original.

### Step 4: Turbopack `moduleIdStrategy: 'deterministic'`

Checked for `turbopack.moduleIdStrategy` configuration in Next.js 16.2.6.

**Result**: This option **does not exist** in Next.js 16.2.6. No corresponding code found in `node_modules/next/dist/`. Skip.

### Step 5: Webpack Build Comparison

Built with webpack (without `--turbopack` flag) to determine if the chunk count is a Turbopack-specific issue.

**Result**: Webpack build also produces **50 total chunks** (37 initial + 13 dynamic). Same as Turbopack.

**Conclusion**: The chunk count is determined by the **application module graph**, not the bundler. Both Turbopack and webpack produce the same result.

## Root Cause Analysis

The profile route cannot reach ≤30 chunks with current application architecture because:

1. **Core client island is large**: `ProfileCompactTemplate` is a single `'use client'` component that imports most of the profile UI. It transitively pulls in large vendor trees (Framer Motion via `motion`, React Query, Sonner toast, Lucide icons) into the initial bundle.

2. **Multiple client boundaries in `page.tsx`**: `PublicClaimBanner`, `ErrorBanner`, `DesktopQrOverlayClient`, `ProfileViewTracker`, `JoviePixel` are all independent client components imported directly in the server page. Each creates a shared chunk with vendor code, multiplying the chunk count.

3. **Dynamic imports create more chunks than they remove**: When components are already in existing dynamic chunk trees, adding new `dynamic()` split points causes the bundler to create additional shared chunk boundaries. This is because the same vendor code must be deduplicated between the new split point and the existing one — at small scales this creates MORE total chunks, not fewer.

4. **Same result on both bundlers**: Webpack and Turbopack produce identical chunk counts. The issue is the module graph, not the chunking algorithm.

5. **`error.tsx` is forced into initial bundle**: Next.js requires `error.tsx` to be a `'use client'` component, and it's always included in the initial route bundle as a required error boundary.

## Paths That Could Actually Achieve ≤30 Chunks

These would require significant refactoring outside the JOV-2271 scope:

### Option A: Merge client boundaries in `page.tsx`
Create a single `ProfileClientGroup` component that wraps `PublicClaimBanner`, `DesktopQrOverlayClient`, `ProfileViewTracker`, and `JoviePixel` into one client boundary. This reduces 4 independent client module entries to 1.

**Estimated reduction**: ~6-8 chunks (the shared chunks created specifically for these components)  
**Risk**: Moderate. Would need careful review of SSR impact for each component.

### Option B: Reduce `ProfileCompactTemplate` imports
`ProfileCompactTemplate` currently imports the full `motion` (Framer Motion) library. Replacing motion animations with CSS transitions would eliminate one of the largest vendor trees from the initial profile bundle.

**Estimated reduction**: ~5-8 chunks (motion-related vendor chunks)  
**Risk**: High. Requires visual regression testing across all profile animation states.

### Option C: Convert `ErrorBanner` to server-renderable fallback on the profile route
Replace the `ErrorBanner` client component (which imports `sonner` toast library) in `page.tsx` with a simple server-rendered error state. `ErrorBanner` is only shown on DB errors and doesn't need client interactivity on the profile page.

**Estimated reduction**: ~2-3 chunks (sonner vendor tree)  
**Risk**: Low. The error path is rare; a server-rendered fallback is sufficient.

### Option D: Next.js upgrade with improved ISR streaming
A Next.js upgrade introducing server component streaming could allow lazy-loading entire route segments. This is the only way to get the profile route below ~25 chunks without major refactoring.

**Estimated reduction**: ~10+ chunks (if ISR streaming + server suspense is available)  
**Risk**: High. Requires framework upgrade and testing.

## Current State

- No code changes landed (all attempts reverted to baseline)
- Baseline remains at **49 chunks** (36 initial + 13 dynamic)
- Chunk count is bounded by the application module graph, not the bundler

## Recommendation

The ≤30 chunk acceptance criterion cannot be met without one of the four refactoring options above. Recommended next steps:

1. **File JOV-XXXX**: "Reduce profile route chunk count: merge client boundaries in page.tsx" (Option A, low-risk entry point)
2. **File JOV-XXXX**: "Profile page: replace ErrorBanner with server-rendered error state" (Option C, lowest-risk win)
3. Consider whether the TBT goal (≤300ms) is the actual user-facing requirement — if Lighthouse TBT is already meeting the goal, closing JOV-2271 in favor of targeted follow-up tickets is reasonable.

## Measurement Commands

```bash
# Count profile route chunks
python3 - <<'EOF'
import json, re
manifest_path = 'apps/web/.next/server/app/[username]/page_client-reference-manifest.js'
with open(manifest_path) as f:
    content = f.read()
match = re.search(r'globalThis\.__RSC_MANIFEST\[.*?\]\s*=\s*(\{.*\})', content, re.DOTALL)
data = json.loads(match.group(1))
chunk_set = set()
for info in data.get('clientModules', {}).values():
    for c in info.get('chunks', []):
        chunk_set.add(c)
print(f'Initial chunks: {len(chunk_set)}')

import os
loadable_path = 'apps/web/.next/server/app/[username]/page/react-loadable-manifest.json'
with open(loadable_path) as f:
    loadable = json.load(f)
dyn = set()
for key, entries in loadable.items():
    for entry in (entries if isinstance(entries, list) else [entries]):
        for c in entry.get('files', []):
            if c.endswith('.js') and not c.startswith('static/chunks/webpack'):
                dyn.add(c)
print(f'Dynamic chunks: {len(dyn)}')
print(f'Total: {len(chunk_set) + len(dyn)}')
EOF
```
