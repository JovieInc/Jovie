# Section Registry Guide

The landing-page section registry (commit `f5c0bc2d2`) is a typed catalog of every marketing-page section variant in the codebase. It powers two preview surfaces (`/exp/page-builder` and `/exp/component-checker`) and serves as the source of truth for "what sections exist, where they ship, and which are consolidation debt."

Source: `apps/web/lib/sections/`. Variants live in `apps/web/lib/sections/variants/<category>.tsx`.

## Variant shape

Every entry implements `SectionVariant`:

| Field | Purpose |
|---|---|
| `id` | Stable kebab-case ID. Used in `?id=` query params on preview surfaces. |
| `category` | One of: `header`, `hero`, `logo-bar`, `feature-card`, `testimonial`, `faq`, `footer-cta`, `footer`. |
| `label` | Human label in the picker. |
| `description` | One-liner shown in the metadata panel. **This is the place to capture migration intent honestly.** |
| `componentPath` | Repo-relative path to the component. |
| `usedIn` | Routes / surfaces actually rendering this variant. Be honest — empty array = orphaned. |
| `status` | `canonical` / `consolidate` / `orphaned` — see below. |
| `mergeInto` | When `status !== 'canonical'`, points at the canonical `id` to merge into. |
| `canonical` | Optional boolean. Default pick when the category is selected. One per category. |
| `render` | Function returning a demo instance with realistic preview data. Server-renderable when possible. |

## Status flags

- **`canonical`** — live, maintained, on-spec. Merge targets for consolidation. Pick this for new work.
- **`consolidate`** — exists and renders, but represents debt. Set `mergeInto` to the canonical sibling and document the migration in the `description`.
- **`orphaned`** — has no current consumers (`usedIn: []`). Delete-on-sight once you've verified no transitive callers.

If a variant is imported by a component that is itself dormant or feature-flagged off, mark the variant `consolidate` (not `orphaned`) and explain the chain in the description. The PayPromo / CTASection chain in `variants/footer-cta.tsx` is a worked example.

## Categories

| Category | Purpose |
|---|---|
| `header` | Top navigation (landing, content, minimal, homepage). |
| `hero` | Above-the-fold (centered, left, split). |
| `logo-bar` | Trust strips (card, compact, inline). |
| `feature-card` | Outcome / feature grids. |
| `testimonial` | Customer quote rows. |
| `faq` | Collapsible Q&A. |
| `footer-cta` | Final CTA before footer. |
| `footer` | Page footer (expanded or minimal). |

## Preview surfaces

- **`/exp/page-builder`** — compose multiple sections into a full page. Toolbar lets you swap header, hero, body sections, footer CTA, and footer. Used to spot-check landing-page compositions before committing.
- **`/exp/component-checker`** — render one variant full-bleed. Arrow keys move within a category; ⌘+arrow jumps categories. Shows status, description, and component path. Use this to scan for consolidation opportunities and confirm orphaned status.

## Add a new variant

1. Create the component under `apps/web/components/...` (prefer SSR-safe).
2. Open `apps/web/lib/sections/variants/<category>.tsx`.
3. Append a `SectionVariant` object to the category's exported array. Required: `id`, `category`, `label`, `description`, `componentPath`, `usedIn`, `status`, `render`. Add `canonical: true` only if it should be the default.
4. Visit `/exp/component-checker?id=<id>` to verify.
5. If this variant should retire an existing one, update the old one's `status` to `'consolidate'` (not `'orphaned'`) until live consumers are migrated.

## Marking consolidation work

When a variant should be folded into a canonical sibling:

1. `status: 'consolidate'`
2. `mergeInto: '<canonical-id>'`
3. Update `description` honestly: which routes still use it, what's the migration step, why hasn't it been deleted yet.
4. Keep `render` working so the variant stays previewable during the window.
5. As routes migrate, prune `usedIn`. When `usedIn: []` AND no transitive importer is alive, flip to `status: 'orphaned'` and delete.

The registry is only useful if it's honest. Lying via `usedIn: []` while an importer still references the component (even a dormant one) is the most common failure mode — `/exp/component-checker` is the audit tool to catch it.
