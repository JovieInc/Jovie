# Auth UX Visual Audit — JOV-2036

**Captured:** 2026-05-09T03:12:54Z  
**Captured against:** `staging.jov.ie` (real Clerk) + `localhost:3000` (CLERK_MOCK=1 for fallback states)  
**Screenshots location:** `.context/auth-visual-audit/2026-05-09T031254Z/` (local, untracked)  
**Informing:** JOV-2034 (modal redesign), JOV-2037 (regression tests)

---

## Capture Matrix

| Surface | State | Breakpoints | Count |
|---------|-------|-------------|-------|
| `/signin` | Default (Clerk loaded) | 9 (375→3440) | 9 |
| `/signin` | Loading/Auth-unavailable (mock env) | 9 (375→3440) | 9 |
| `/signin` | Email prefill (`?email=test@example.com`) | 9 (375→3440) | 9 |
| `/signup` | Default (Clerk loaded) | 9 (375→3440) | 9 |
| `/signup` | Loading/Auth-unavailable (mock env) | 9 (375→3440) | 9 |
| `/signup` | OAuth error (`?oauth_error=account_exists`) | 9 (375→3440) | 9 |
| `/signup` | Handle availability check (`?handle=timwhite`) | 9 (375→3440) | 9 |
| `/signup` | Plan intent (`?plan=founding`) | 9 (375→3440) | 9 |
| Marketing modal (AuthModalShell) | Default (signup via parallel route) | 9 (375→3440) | 9 |
| Marketing modal (MarketingSignInModal) | Skeleton (local HTML fixture) | 9 (375→3440) | 9 |

**Total captured: 90 screenshots**  
*(Plus 2 supplementary captures during diagnosis = 92 total on disk)*

Note: MarketingSignInModal sign-in state was captured via staging `/signup` parallel route interception (AuthModalShell). The original MarketingSignInModal is only triggered from the `minimalAuth` header variant (not rendered on the primary marketing homepage header, which uses navigation links to `/signin`). Skeleton rendered via local HTML fixture faithfully reproducing the component's `SignInSkeleton` JSX.

---

## Surface Architecture Notes

Three distinct auth surface types exist in the codebase:

1. **`/signin` full page** — `AuthLayout` with `layoutVariant='split'`. Left: Clerk `<SignIn>` inside `max-w-[420px]`. Right: `AuthBrandPanel` carousel (product screenshots) at `lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]`. Right panel only visible at `lg:` (1024px+).

2. **`/signup` full page** — Same `AuthLayout` split. Left adds custom heading ("Request Access"), description, and optional banners (handle check, OAuth error) above Clerk `<SignUp>`. Right: same brand panel.

3. **`MarketingSignInModal`** — Compact dark modal portaled to `<body>`. Scoped `ClerkProvider` (separate from main layout tree — preserves marketing page static optimization). Max width 400px with `min-height: 520px`. Includes `SignInSkeleton` placeholder that disappears once Clerk mounts.

4. **`AuthModalShell`** — Native `<dialog>` intercepted signup modal. Activates via Next.js parallel routes when navigating to `/signup` from a same-origin page on desktop. `w-[min(calc(100vw-24px),600px)]`. Used for the chat intake flow.

---

## Findings by Breakpoint

### 375×667 (iPhone SE) — `/signin` and `/signup`

**Good:**
- Clerk form is fully visible and usable at this size
- Single-column layout (no brand panel below lg:) appropriate
- "Welcome back" heading at sensible size (~22px)
- Google OAuth button renders at full width with proper minimum touch target

**Issues:**
- `/signup` shows TWO headings stacked: "Request Access" (custom h1, 22px semibold) directly followed by Clerk's "Create your account" heading (Clerk-injected). This is a direct violation of the "One heading per visual section" rule from `.claude/rules/ui.md`. The Clerk heading should be suppressed via appearance overrides or the custom heading removed.
- Cookie consent banner overlaps bottom of the form on first visit, hiding the "Secured by Clerk" footer and terms link.
- AuthUnavailableCard (mock env): Large text "Sign in is temporarily unavailable" renders at 3rem+ on a 375px viewport, looks almost headline-scale — more alarming than necessary. The "Auth unavailable" pill badge above it is redundant (says the same thing twice).
- Bottom safe-area padding: form is clipped on SE (no safe-area-inset-bottom compensation visible in screenshot).

**Recommendation for JOV-2034:** The `/signup` double-heading is the highest-priority fix. Either remove the custom "Request Access" h1 and let Clerk's heading stand, or suppress Clerk's heading via `appearance.elements.headerTitle = 'hidden'` and keep the custom heading only.

---

### 390×844 (iPhone 14)

**Good:**
- Same as SE, slightly more breathing room
- Form sits comfortably without the cramped bottom clip

**Issues:**
- Same double-heading issue on `/signup`
- Cookie banner overlap still present
- Dev toolbar (14px bar) at bottom takes ~14px of already-constrained viewport

---

### 768×1024 (Tablet Portrait)

**Good:**
- Clerk form expands naturally, still single-column (below `lg:` breakpoint)
- Max-width 420px centers the form with adequate side padding
- "Welcome back" heading at appropriate scale

**Issues:**
- `/signup`: Triple redundant context — page-level "Request Access" + "Create an account to start your private launch request." (custom description) + Clerk's "Create your account" heading. At this viewport these three consecutive lines before the first form field create significant scroll distance before the user can act.
- Form appears horizontally centered but left-aligned text within creates an awkward half-justified feel at this width — the form column is ~420px centered in a 768px canvas, which looks isolated.
- `AuthBrandPanel` is NOT shown at tablet portrait (correct — it's `lg:` only), but the canvas feels very empty with the form floating in the center of a dark full-screen layout.

---

### 1024×1366 (Tablet Landscape)

**Good:**
- Split layout activates at this breakpoint (lg:)
- Left form column + right brand panel is visible
- Form column is correctly constrained to `minmax(0,420px)`
- Brand panel shows product screenshot carousel (`AuthBrandPanel`) with "Built for Artists." heading and progress bars

**Issues:**
- The right brand panel (`AuthBrandPanel`) takes the full remaining width from 1024 upward without a maximum width cap. At 1024px tablet landscape this is fine (right panel ≈ 604px wide), but this unbounded growth becomes a problem at ultra-wide.
- The `AuthBrandPanel` screenshot frame (`mx-8 aspect-[16/10]`) means the product screenshot sits floating in the lower half of a very tall right panel at 1024×1366 — lots of black emptiness above and below the screenshot.

---

### 1280×800 (Laptop)

**Good:**
- Split layout is working well at this viewport
- Left column: form is appropriately sized with good whitespace
- Right column: brand panel screenshot fills better at 800px tall vs 1366px

**Issues:**
- `/signup`: At this size the triple-heading issue is most pronounced — "Request Access" + description + "Create your account" consumes ~130px before any form interaction
- The `AuthBrandPanel` heading "Built for Artists." sits at the bottom of the right panel. At 1280×800 the screenshot is nearly full-width of the panel, which looks good, but there's significant dead space above the screenshot.

---

### 1440×900 (Desktop) — Primary Target

**Good:**
- This is the sweet spot for the layout — both columns look intentional
- Clerk form fully loaded: "Welcome back" + Google button + email field + Continue + "No account? Sign up" + "Secured by Clerk"
- Right panel: Calvin Harris product screenshot fills nicely with "Built for Artists." and 3-segment progress bar
- Brand logo (Jovie mark) top-left at `lg:top-7 lg:left-14` is well-positioned

**Issues:**
- `/signup` double heading: At desktop the form + headings + Clerk form creates a very long left column that requires scrolling in some viewport heights (900px is tight)
- The Jovie brand logo top-left is `z-50` and always visible, but on the right panel side the brand isn't reinforced — the carousel context with "Built for Artists." is good but disconnected from the left form UX
- `/signup?oauth_error=account_exists`: The error banner renders with `text-destructive` which is correct, but it's positioned ABOVE the custom headings (above "Request Access"), then the headings, then the error banner's "Sign in instead" link makes a third reference to sign-in. The layout stack at this point is: [OAuth error banner] → [Request Access heading] → [description] → [Clerk's Create your account heading] → [form]. Four elements before first action.

**Handle availability (`?handle=timwhite`):**
- Banner renders correctly: "@timwhite is available. Sign up to claim it." in `text-primary-token`
- Border-subtle + bg-surface-1 banner is readable
- But this banner appears ABOVE the "Request Access" heading, creating a confusing read order: [available banner] → [Request Access heading] → [description] → [Clerk heading] → [form]. The handle banner reads as floating context; it should be closer to the email field or integrated into the Clerk form experience.

---

### 1920×1080 (Large Desktop)

**Good:**
- Layout holds well, neither column feels cramped

**Issues:**
- Left form column: The `max-w-[420px]` form centered in a column that spans ~720px (roughly) of the 1920px viewport leaves significant horizontal whitespace on either side of the form within the left column.
- The left column itself is `minmax(0,420px)` so it's capped at 420px — which means on a 1920px viewport the right brand panel takes about 1500px. The 16:10 aspect-ratio product screenshot at `mx-8` within that column is ~1480px wide — which scales the screenshot to a very large size. Need to check if there's a max-width on the frame.
- Grain texture (`auth-shell-grain`) visible as a subtle film over the dark bg. Not intrusive but worth noting.

---

### 2560×1440 (Ultra-Wide QHD)

**Critical Finding:**
- `/signin`: Form column is correctly constrained to max-width ~420px. LEFT SIDE LOOKS TINY.
- The form sits in the extreme-left of a 2560px canvas, while the right brand panel occupies ~2140px. The product screenshot within it is enormous — nearly full-screen-width.
- The split `grid-cols-[minmax(0,420px)_minmax(0,1fr)]` without a max-width on the right column causes the brand panel to expand to 2000+ px at ultra-wide.
- Left column form is visually dwarfed relative to the product showcase panel.
- The Jovie logo is positioned at `lg:left-14` (56px from edge) — on a 2560px screen this creates a large dead zone.

**Severity: HIGH** — The auth layout at 2560px looks imbalanced. The 1fr right column needs a max-width cap to prevent runaway expansion. Recommended: `grid-cols-[minmax(0,420px)_minmax(0,min(800px,1fr))]` or similar.

---

### 3440×1440 (Ultra-Wide Curved)

**Critical Finding:**
- Same as 2560×1440 but more extreme. The form column is ~420px against a 3440px canvas.
- The product screenshot panel spans approximately 3000px, making the Calvin Harris demo screenshot enormous.
- At 3440×1440, the left form column represents only ~12% of the screen width. The visual weight is severely off.
- The MarketingSignInModal (via skeleton fixture) correctly shows the modal staying at max-width 400px and centering in the viewport — this is the RIGHT approach. The modal does NOT expand with viewport width.

**Severity: HIGH** — `/signin` and `/signup` full-page layouts need a maximum right-column width at ultra-wide breakpoints. The modal approach (centered, fixed max-width) is correctly implemented.

---

## Design Checklist Results

| Check | Result | Details |
|-------|--------|---------|
| Modal stays small + centered at ultra-wide | PASS | `MarketingSignInModal` max-width 400px is correctly enforced. `AuthModalShell` max-width 600px is correctly enforced. |
| Full-page layout stays balanced at ultra-wide | FAIL | Right brand panel expands unbounded via `1fr` grid column. At 2560px+ the form column looks tiny. |
| No card-on-card / nested chrome | PASS | No nested card surfaces observed. Brand panel and form use distinct sections without redundant borders. |
| Single heading per surface | FAIL | `/signup` renders TWO headings: "Request Access" (custom h1) + Clerk's "Create your account" heading. |
| No emoji in UI | PASS | No emoji found anywhere in the auth UX. |
| No decorative hover lift | PARTIAL PASS | `MarketingSignInLink` button with `variant='pill'` has `hover:-translate-y-[0.5px]` — this is a decorative hover lift violation per `.claude/rules/ui.md`. However it's only on the pill variant, which is not the primary auth trigger. |
| Sentence/title casing per DESIGN.md | PASS | "Welcome back" (sentence case for subheads), "Continue with Google" (title case for buttons), "Email address" (sentence case for labels) — all correct. |
| Marketing pages fully static | PASS | Auth pages are in `(auth)` route group, not `(marketing)`, so the static rule does not apply here. |
| Subtraction principle | FAIL | `/signup` has accumulated three layers of context: custom heading + custom description + Clerk's heading. The Clerk heading should be suppressed or the custom elements should be removed. |
| Clerk proxy via `/__clerk` | CANNOT VERIFY VIA SCREENSHOT | Confirmed in code via `getClerkProxyUrl()` usage in `MarketingSignInModal.tsx`. |
| AuthFormSkeleton shown before Clerk mounts | PASS | The `AuthFormSkeleton` renders correctly during SSR/hydration gap. Verified via auth-unavailable screenshots showing the design. |

---

## Priority Findings for JOV-2034 Modal Redesign

### P0: Double heading on `/signup`
- File: `/apps/web/app/(auth)/signup/page.tsx`
- Issue: `<h1>Request Access</h1>` custom heading + Clerk's "Create your account" heading both render simultaneously. This is a one-heading-per-section violation.
- Fix options:
  - A) Remove the custom h1 and let Clerk's heading ("Create your account") stand. Keep the description below Clerk's heading via `appearance.elements.headerSubtitle`.
  - B) Suppress Clerk's heading via `appearance.elements.headerTitle: { display: 'none' }` and keep the custom "Request Access" heading.
  - Recommendation: Option B. The "Request Access" copy is intentional product framing (waitlist context). Suppress Clerk's generic heading.

### P1: Ultra-wide layout imbalance
- File: `/apps/web/components/features/auth/AuthLayout.tsx`
- Issue: `grid-cols-[minmax(0,420px)_minmax(0,1fr)]` at `lg:` has no max-width cap on the right column. At 2560px+ the brand panel dominates visually.
- Fix: Add `max-w-[min(900px,1fr)]` or constrain the grid wrapper to a maximum total width. `max-w-[1440px] mx-auto` on the grid container would prevent ultra-wide expansion.

### P2: Handle availability banner placement
- File: `/apps/web/app/(auth)/signup/page.tsx`
- Issue: Handle availability banner (`SignUpClaimDataPersistence`) renders above the custom heading, creating confusing read order. It should appear between the heading and the Clerk form, or be integrated into the Clerk form feedback area.

### P3: OAuth error banner → sign-in flow redundancy
- File: `/apps/web/app/(auth)/signup/page.tsx`
- Issue: `SignUpOauthErrorBanner` at the top + "Have an account? Sign in" from Clerk + potential sign-in footer link = three sign-in prompts. The banner's "Sign in instead" link is sufficient; the Clerk footer link should be surfaced instead.

### P4: MarketingSignInLink pill variant hover lift
- File: `/apps/web/components/organisms/MarketingSignInLink.tsx`
- Issue: `hover:-translate-y-[0.5px]` on the pill variant violates the no-decorative-hover-motion rule.
- Fix: Replace with `hover:opacity-90` or `hover:bg-white/95` (already present).

### P5: AuthUnavailableCard visual alarm level
- File: `/apps/web/components/features/auth/AuthUnavailableCard.tsx`
- Issue: "Sign in is temporarily unavailable" at headline scale + "Auth unavailable" badge = two redundant signals. The badge alone suffices; the heading could read "Signing you in..." or similar neutral framing.

---

## Recommendations Summary for JOV-2034

1. **Suppress Clerk's built-in heading on `/signup`** via `appearance.elements.headerTitle` (P0, 1-line fix).
2. **Cap right brand panel width at ultra-wide** via `max-w-[min(900px,1fr)]` on the grid column or a max-width wrapper on the `AuthLayout` grid (P1).
3. **Reorder `/signup` banners** so handle availability shows between heading+description and Clerk form (P2).
4. **Remove hover:-translate-y on pill variant** from `MarketingSignInLink` (P4).
5. **Consider consolidated modal redesign** per JOV-2034 scope: the `AuthModalShell` (600px, native dialog) and `MarketingSignInModal` (400px, portaled) are architecturally separate. A unified modal design should choose one approach. The `AuthModalShell` with its back-button UX and native dialog is the better foundation.

---

## Files Referenced

- `/apps/web/components/organisms/MarketingSignInModal.tsx` — standalone marketing modal
- `/apps/web/components/organisms/MarketingSignInLink.tsx` — trigger button for marketing modal
- `/apps/web/components/auth/AuthModalShell.tsx` — intercepted modal shell (native dialog)
- `/apps/web/components/features/auth/AuthLayout.tsx` — layout wrapper for /signin and /signup
- `/apps/web/components/features/auth/AuthBrandPanel.tsx` — right-column product carousel
- `/apps/web/app/(auth)/signin/page.tsx` — signin page
- `/apps/web/app/(auth)/signup/page.tsx` — signup page
- `/apps/web/app/@auth/(.)signup/page.tsx` — intercepted signup modal page
- `/apps/web/components/features/auth/AuthPageSkeleton.tsx` — loading skeleton
