# Jovie public marketing consolidation inventory

Status: Stage 1 source inventory and Stage 2 first-batch decision
Owner: Gem / Symphony
Source snapshot: `origin/main` at `1ae47899e7456e94db0b4717f31329966b5c5597`
Prepared: 2026-08-08

This artifact is the saved handoff between the inventory, diagnosis, and
implementation stages. It is intentionally source-first: route titles and
historical screenshots are not treated as proof of current behavior.

## Stage gates

| Stage | Inputs | Deliverable | Pass condition |
| --- | --- | --- | --- |
| 1. Factual inventory | `apps/web/app`, route manifest, recipe/section registries, shared shell sources, design tokens, existing guards | This file and the generated route list | Every public route in the manifest has one source glob, lifecycle, binding status, and shell classification; aliases and sanctioned exemptions are explicit |
| 2. Diagnosis and narrow objective | Stage 1 plus current source diffs and design-system policy | First non-overlapping batch below | Each change removes a measured source divergence without changing route, content, auth, analytics, or an approved visual contract |
| 3. Implementation | Approved batch only | One focused branch/PR | Diff is limited to the batch, normal tests pass, and no new raw visual primitive is introduced |
| 4. Source-blind verification | Built route plus existing unit/style gates and responsive/a11y checks | Verification receipt in the PR | Routes render at narrow and desktop widths, keyboard focus and reduced motion remain valid, no overflow/console regression, and route/link/analytics assertions pass |
| 5. Ship proof | Native CI, merge queue, production controller | Separate source/CI, exact-main, and deployed evidence | Required checks are green and the native queue/controller lands the change; no direct merge or manual deploy |

## Source of truth

Normative design and route sources are:

- `apps/web/data/marketing/routeManifest.ts` (route-to-recipe/exemption
  binding and alias metadata).
- `apps/web/data/marketing/recipes.ts`, `sections.ts`, and `composition.ts`
  (page grammar, responsive contracts, motion budget, and section legality).
- `apps/web/design/tokens.json`, `apps/web/design/system-release.json`,
  `packages/ui`, and `packages/ui/theme/motion-policy.ts` (tokens, primitives,
  and motion policy).
- `apps/web/components/site/PublicPageShell.tsx`,
  `MarketingHeader.tsx`, `MarketingFooter.tsx`, and
  `apps/web/components/marketing/MarketingContainer.tsx` (shared public
  chrome and page grid).
- `docs/marketing/ARCHITECTURE.md`, `COMPOSITION_RULES.md`, and
  `AGENT_GUIDE.md` (rationale only; typed registries remain normative).

The durable design policy requires one shared Jovie vocabulary across product
and marketing, mobile-first composition, canonical tokens/primitives, one
page grid, real product evidence, and reduced-motion-safe interaction. The
historical full audit in gbrain reported 37 reachable URLs; this current source
inventory is narrower and reproducible from the checked-in manifest: 28 route
globs, including aliases and internal/noindex surfaces.

## Current route inventory (28 manifest entries)

Binding status is the current manifest value. “Verified” means the manifest
has a recipe and approved section bindings; it does not mean visual acceptance
or deployment proof. “Exempt” is a sanctioned JOV-4063 escape hatch and is
not silently migrated in this batch.

### Active recipe-bound routes

| URL | Source glob | Recipe | Binding | Alias/noindex | Current shell evidence |
| --- | --- | --- | --- | --- | --- |
| `/` | `(home)/page.tsx` | homepage | verified | — | `PublicPageShell` homepage variant; feature-flagged story variants are not certified by the manifest |
| `/new` | `(marketing)/new/page.tsx` | homepage | verified | alias of `/` | `PublicPageShell` + `MarketingPageShell` via `HomepageV2Route` |
| `/pricing` | `(marketing)/pricing/page.tsx` | pricing | verified | — | `MarketingPageShell` + `MarketingContainer` |
| `/artist-profiles` | `(marketing)/artist-profiles/page.tsx` | artist-lp | verified | — | shared `PublicPageShell`; mobile-first artist family with scoped CSS |
| `/artist-profile` | `(marketing)/artist-profile/page.tsx` | artist-lp | verified | alias of `/artist-profiles` | same `ArtistProfileLandingRoute` and chrome |
| `/artist-notifications` | `(marketing)/artist-notifications/page.tsx` | feature | verified | — | `MarketingPageShell` + shared sections/containers |
| `/download` | `(marketing)/download/page.tsx` | feature | verified | — | shared shell and containers; intentionally cinematic page surface |
| `/pay` | `(marketing)/pay/page.tsx` | feature | unverified | — | delegates to `PayLanding`; body is outside the bounded route audit |
| `/voice` | `(marketing)/voice/page.tsx` | feature | verified | noindex | shared `MarketingHero`, but local `max-w-5xl` section wrapper diverges from the canonical page grid |
| `/instant-merch` | `(marketing)/instant-merch/page.tsx` | feature | verified | — | `MarketingPageShell` + shared containers |
| `/launch` | `(marketing)/launch/page.tsx` | launch | verified | — | `MarketingPageShell` + shared containers; legacy visual fork remains a separate decision |
| `/about` | `(marketing)/about/page.tsx` | seo | verified | — | shared `MarketingHero`/`MarketingContainer` |
| `/support` | `(marketing)/support/page.tsx` | seo | unverified | — | uses shared primitives; `SupportChannels` section mapping needs a later parity pass |
| `/compare/*` | `(marketing)/compare/[slug]/page.tsx` | comparison | verified | — | shared comparison recipe and containers |
| `/alternatives/*` | `(marketing)/alternatives/[slug]/page.tsx` | comparison | verified | — | shared comparison recipe and containers |
| `/blog` | `(marketing)/blog/page.tsx` | blog-landing | verified | — | shared `MarketingHero`/`MarketingContainer` |
| `/blog/category/*` | `(marketing)/blog/category/[slug]/page.tsx` | blog-landing | verified | — | shared `MarketingHero`/`MarketingContainer` |
| `/waitlist` | `waitlist/page.tsx` | waitlist | unverified | auth-sensitive | redirect/auth state machine; do not change without auth-boundary tests |

### Sanctioned exempt/internal routes

| URL | Source glob | Why it is separate today | Safe treatment in this workstream |
| --- | --- | --- | --- |
| `/ai` | `(marketing)/ai/page.tsx` | noindex public brief, hand-rolled layout; JOV-4063 exemption | Preserve content and noindex; normalize only the shared page grid in the first batch |
| `/blog/*` | `(marketing)/blog/[slug]/page.tsx` | dynamic article body | Keep content organism; no shell rewrite in first batch |
| `/blog/authors/*` | `(marketing)/blog/authors/[username]/page.tsx` | dynamic author/post list | Keep content organism; no shell rewrite in first batch |
| `/changelog` | `(marketing)/changelog/page.tsx` | generated `CHANGELOG.md` content | Already uses shared hero/container; defer visual review |
| `/demo/video` | `(marketing)/demo/video/page.tsx` | noindex demo surface | Keep separate until demo owner review |
| `/demovideo` | `(marketing)/demovideo/page.tsx` | noindex legacy duplicate | Preserve route behavior; consolidation/redirect is a separate decision |
| `/investors` | `(marketing)/investors/page.tsx` | noindex investor brief, hand-rolled layout; JOV-4063 exemption | Preserve content/noindex; normalize only the shared page grid in the first batch |
| `/renders` | `(marketing)/renders/page.tsx` | internal screenshot index | Keep render harness surface separate |
| `/renders/*` | `(marketing)/renders/[state]/page.tsx` | internal render state | Keep render harness surface separate |
| `/renders/surfaces/*` | `(marketing)/renders/surfaces/[surface]/page.tsx` | internal surface render | Keep render harness surface separate |

## Shared-shell graph and divergences

```text
PublicPageShell (layout-owned header, main, footer, skip link)
├── (marketing)/layout.tsx
│   ├── MarketingPageShell (minimal page wrapper) on most recipe routes
│   ├── route-owned MarketingContainer / section primitives
│   └── sanctioned hand-rolled briefs: /ai, /investors
└── (home)/layout.tsx
    └── homepage variant (icon logo, minimal footer, no main offset)
```

Observed source signatures:

- The shared chrome is real and reused: `PublicPageShell` owns
  `MarketingHeader`, `main#main-content`, `MarketingFooter`, and the skip link.
- `MarketingPageShell` is intentionally only a relative/grow wrapper (JOV-4872:
  no `min-h-screen` — the layout shell owns viewport height, and nesting it
  double-applied the header offset as extra scroll height). It does not
  replace the layout shell. This is correct for pages under the
  marketing layout, but must not be mistaken for a second header/footer.
- `MarketingContainer` is the canonical centered grid (`page`/`landing` map to
  the public-content token; `prose` maps to the prose token). Local
  `max-w-5xl` + bespoke horizontal padding is a measurable divergence.
- `/voice`, `/ai`, and `/investors` carry local max-width/padding wrappers.
  They preserve the shared outer layout but bypass the canonical page-grid
  primitive. `/voice` is recipe-bound; `/ai` and `/investors` are sanctioned
  noindex exemptions.
- `/download` has a named cinematic surface and already uses canonical page
  containers; its surface treatment is an approved content choice, not a
  duplicate shell.
- `/pay` delegates to a feature surface whose composition is not verified by
  the manifest. `/waitlist` is an auth/redirect boundary, not a visual shell
  candidate.
- Internal render routes intentionally use black/inline render-harness
  surfaces and remain out of marketing consolidation batches.
- Artist Profiles already use `ArtistProfileLandingRoute`, shared containers,
  canonical product-callout primitives, and scoped motion/a11y guards. The
  remaining artist work must stay mobile-first and source-backed; no
  desktop-first carousel or new imagery is authorized by this inventory.

## First fix batch (Stage 2 decision)

Batch A is limited to the three static brief/feature pages that currently use
local page-grid wrappers:

1. `/voice`: replace the local `max-w-5xl` wrapper with
   `MarketingContainer width='page'` while preserving the existing sections,
   copy, CTAs, analytics hooks, noindex metadata, and token surfaces.
2. `/ai`: use the same canonical page container inside the existing `main`;
   preserve the sanctioned JOV-4063 exemption, noindex metadata, and links.
3. `/investors`: use the same canonical page container inside the existing
   `main`; preserve the sanctioned JOV-4063 exemption, noindex metadata, and
   links.

This batch is intentionally spacing/grid-only. It does not remove approved
route exemptions, alter aliases, add imagery, change auth, or change analytics.
It is independently verifiable and does not touch the queued/landed alias
performance fix.

### Later non-overlapping batches

- B: reconcile `/pay` and `/support` manifest evidence after reading their real
  feature bodies; add route-specific parity tests before visual changes.
- C: artist-profile source-backed mobile pass (outcomes rail/ledger and any
  remaining bespoke motion) with narrow/desktop screenshots, reduced-motion,
  keyboard, and overflow evidence. Do not revive desktop-first layouts.
- D: legacy duplicate decision (`/new`, `/launch`, `/demovideo`) only after a
  route/analytics/SEO decision; no redirect or deletion is inferred here.
- E: dynamic/content/render surfaces only with their owning contracts. A
  founder-visible taste decision or unavailable Magic Patterns access is a
  bounded blocker, not an invitation to invent a direction.

## Acceptance and ship proof for Batch A

- Source checks: existing marketing recipe manifest and System B guards pass;
  a focused source contract asserts all three pages use the canonical
  `MarketingContainer width='page'` and contain no local `max-w-5xl` shell.
- Behavior: existing page tests plus route metadata/link assertions pass;
  no route, content, auth, or analytics source changes outside the wrapper.
- Responsive: narrow (375px) and desktop (1280px) renders show the same
  content, no horizontal overflow, and 44px-or-larger interactive targets.
- Accessibility/motion: keyboard focus remains visible; no new animation or
  `transition-all`; reduced-motion remains governed by existing primitives.
- Ship: required CI green, native merge queue lands the PR, then exact-main and
  production-controller/deployed SHA are reported separately. A merged PR is
  not a deployment claim.
