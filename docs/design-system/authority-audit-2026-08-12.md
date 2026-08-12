# Design authority audit — 2026-08-12

This inventory covers active design prose, generated agent prompts, Storybook review
copy, executable guards, product-controlled typography, typed component registries,
and historical design records. `canon/OPERATING_SYSTEM.md` and `canon/DESIGN.md`
remain the company/domain constitution; they delegate operational execution to
root `DESIGN.md`.

Classifications: **canonical** is active authority, **stale** contradicts the current
founder lock, **duplicate** mirrors authority and must be generated or mechanically
checked, and **ambiguous** needs an owner/founder choice before source behavior changes.

| Classification | Authority or enforcement surface | Exact evidence | Resolution in this stack |
| --- | --- | --- | --- |
| canonical | Company/domain hierarchy | `canon/README.md:3-14`; `canon/OPERATING_SYSTEM.md:8-14`; `canon/DESIGN.md:68-70` | Preserved above operational design rules. |
| canonical | Operational design rules | `DESIGN.md:8-46` | Adds explicit precedence, August 12 locks, review/source boundary, and global logo normalization. |
| canonical | Typed component identity graph | `apps/web/data/designSystem/componentRegistry.ts:20-141,182-243`; `apps/web/data/marketing/componentRegistry.ts:15-68,95-127,225-245,411-535` | Preserved. One concept/root and variant-axis validation remains authoritative. |
| canonical | Registry executable proof | `apps/web/tests/unit/marketing/component-registry.test.ts:220-592`; `apps/web/tests/unit/marketing/storybook-catalog-coverage.test.ts:106-180` | Preserved. These already reject duplicate roots and non-canonical story bodies. |
| canonical | Locked component-family tests | `apps/web/components/site/MarketingFooter.test.tsx:35-108`; `apps/web/tests/unit/home/HomeTrustSection.test.tsx:13-66`; `apps/web/tests/unit/marketing/MarketingHero.test.tsx:29-117` | Preserved; Trust gains shared asset normalization in the dependent stack layer. |
| duplicate | Generated LLM design contract | `scripts/generate-llms-design-manifest.mjs:432-492`; `docs/llms-design-manifest.txt:10-45` | Generator now emits stable canonical invariant IDs; drift and presence are tested. |
| duplicate | Generated gstack skills | `.agents/skills/gstack/design-canonical/SKILL.md.tmpl:165-178`; `.agents/skills/gstack/design-consultation/SKILL.md.tmpl:183-223`; `.agents/skills/gstack/design-html/SKILL.md.tmpl:328-335` | Templates are source; generated copies were regenerated, not hand-edited. |
| stale | Serif recommendations in active agent prompt | `.agents/skills/gstack/design-consultation/SKILL.md.tmpl:209-219` (before cleanup) | Replaced with Jovie's Inter/Satoshi contract; generated skill refreshed. |
| stale | Georgia in active HTML-design example | `.agents/skills/gstack/design-html/SKILL.md.tmpl:328-335` (before cleanup) | Example now uses Satoshi. |
| stale | Product-served Instrument Serif page | `apps/web/public/ai/index.html:11-15,54-56` (before cleanup) | Converted to the canonical sans stack. |
| stale | Product-controlled share-media Source Serif | `apps/web/lib/share/story-renderers.tsx:10-53`; `apps/web/lib/share/image-utils.ts:48-61`; `apps/web/app/api/share/story/{profile,blog,playlist,release}/route.tsx` font registrations | Converted to Satoshi. Media remains product typography, not a blanket UGC exception. |
| stale | Unused pitch serif reference | `apps/web/public/pitch/colors_and_type.css:18,27` (before cleanup) | Removed. Historical pitch HTML remains outside authority but is still directly servable. |
| stale | Decorative accent rotation prose | `.claude/rules/ui.md:103-115` (before cleanup); `DESIGN.md:253,461-464` (before cleanup) | Active authority now says accent is semantic-only. Historical decision rows stay labeled as provenance. |
| stale | Decorative accent uniqueness test | `apps/web/tests/unit/marketing/feature-tile-accent-uniqueness.test.ts:6-20` | Still active runtime friction. Replace with semantic-role assertions when the owning marketing surfaces are source-converged. |
| stale | Decorative title-accent source | `apps/web/components/marketing/artist-profile/ArtistProfileSpecWall.tsx:24-38,336`; `ArtistProfileSpecWall.css:59-83`; `apps/web/app/(home)/home.css:4906-4921` | Audited but not mutated in the governance layer because it changes locked surface rendering. |
| stale | Marketing docs treated Storybook/System A as authority | `docs/marketing/AGENT_GUIDE.md:7-12,64-76,207-220,262-269` (before cleanup) | Redirected to `DESIGN.md` and typed registries; Storybook is review, not authority. |
| stale | Marketing architecture bypassed `DESIGN.md` | `docs/marketing/ARCHITECTURE.md:7-30,223-246` (before cleanup) | Reframed as subordinate grammar/history. |
| stale | Storybook catalog exposed process/system receipts | `apps/web/components/marketing/storybook/MarketingShells.stories.tsx:51-59`; `marketingStoryMeta.ts:3-15` (before cleanup) | Copy now describes canonical families and intentional variants only. |
| stale | Legacy public-surface widths | `docs/design-system/public-surface-consolidation.md:48-54`; `docs/design-system/responsive-system.md:19-30` (before cleanup) | Marked historical and redirected to the 1298px operational contract. |
| stale | Decorative IconBadge guidance | `docs/MIGRATION_GUIDE.md:193-223`; `docs/DESIGN_REVIEW_CHECKLIST.md:71-88` (before cleanup) | Decorative borders/circles removed from active guidance; semantic controls/status remain allowed. |
| stale | Experimental audit claimed source-of-truth status | `DESIGN_SYSTEM_AUDIT.md:1-17,98-100` (before cleanup) | Labeled historical/non-authoritative. |
| stale | Pricing test requires a 44px visible marketing CTA | `apps/web/tests/unit/marketing/marketing-pricing-plans.test.tsx:67-80`; source at `apps/web/components/marketing/MarketingPricingPlans.tsx:70-74` | Audited, not changed here. It needs the canonical Button family to add a 32-visible/44-target variant first. |
| stale | Generic Button cannot express the locked marketing pill | `packages/ui/atoms/button.tsx:33-48`; `packages/ui/atoms/button.test.tsx:100-168`; `packages/ui/atoms/button-contract.ts:15-25` | Existing pseudo-target pattern is reusable; a marketing variant is a separate component-family migration. |
| stale | Touch-target guard conflates visible and hit geometry | `apps/web/lib/a11y-gates/touch-target-engine.ts:1-12,44-58,265-278`; `apps/web/tests/unit/design-system/touch-target-ratchet.test.ts:223-238`; `apps/web/scripts/lint-touch-target.ts:74-80` | Audited. Guard must recognize only the canonical pseudo-target/helper contract before source controls migrate. |
| stale | Marketing header O-mark and target geometry | `apps/web/components/site/MarketingHeader.tsx:166-218`; `apps/web/components/atoms/Logo.tsx:28-42`; `apps/web/components/site/HeaderNav.css:62-66,145-217`; `HeaderNav.tsx:128-150,492-508,574-581` | Audited, not mutated. Current source renders 16/20px marks and some sub-44px targets, contrary to the 32/44 lock. |
| stale | Homepage compact controls lack the canonical hit wrapper | `apps/web/components/homepage/HomepageIntent.tsx:284-325`; `apps/web/components/marketing/HomeComposerHero.tsx:480-500` | Audited, not mutated pending the shared 32/44 family variant. |
| duplicate | Marketing section touch-target prose | `apps/web/data/marketing/sections.ts:503-512,807-815,1181-1190,1416-1423,1576-1584,1663-1668` | Treat as input-target minimum, not visible pill height; typed wording still needs convergence with the new family variant. |
| duplicate | Storybook quality scanner | `scripts/storybook-story-quality-guard.mjs:1-10,55-123` | Kept narrow. Authority and serif semantics now live in a dedicated deterministic guard. |
| ambiguous | Footer vocabulary | `apps/web/components/site/MarketingFooter.tsx:52-73`; `apps/web/tests/unit/home/mounted-home-footer-cta-system-b-style-guard.test.ts:20-38` | Source uses `auto|expanded|minimal`; founder review uses `full|compact`. Confirm alias/rename before migration. |
| ambiguous | Custom desktop header may omit Jovie | `apps/web/components/site/MarketingHeader.test.tsx:151-173` | Founder lock says Jovie is first full-nav item; decide whether custom-nav omission remains a supported escape hatch. |
| ambiguous | Circular semantic status/control icons | `apps/web/components/marketing/artist-profile/ArtistProfileSpecWall.tsx:222-247` | Filter button/status may be functional exceptions; no blanket rounded-icon regex was added. |
| canonical | No-serif and contradiction ratchet | `scripts/design-authority-guard.mjs:6-135`; `scripts/design-authority-guard.test.mjs:1-7`; `scripts/design-authority-exceptions.json:1-3`; `scripts/ci-fast-lanes.mjs:279-300` | Zero unexplained active matches. Ordinary UGC prose is allowed; any typeface exception must be exact-path, exact-match, owned, reasoned, `ugc|media`, and non-stale. |
| canonical | Design Learning Ledger | `apps/web/lib/agent-os/design-lab/learning-ledger.ts:1-170`; `docs/design-system/design-learning-ledger.jsonl:1` | Dedicated typed append-only evidence beside existing Design Lab memory; Markdown remains a non-authoritative projection. |
| canonical | Shared logo normalization | `packages/ui/media/logo-normalization.ts:1-96`; `apps/web/data/design/logo-assets.json:1-95`; `scripts/logo-asset-normalization.mjs:1-88` | Visible-bounds math, per-asset provenance, alpha QA, optical override contract, and reusable render ownership live outside routes. |

## Founder choices still required

1. Name the Footer variants `full|compact` in source, or formally map those review
   names to `expanded|minimal`.
2. Decide whether custom desktop headers may omit the Jovie first-item lock.
3. Confirm which functional status/control icon containers are explicit exceptions to
   the decorative-icon rule.

The header, marketing-pill, accent-rendering, and touch-target mismatches above are
not taste ambiguities. They are known source migrations deliberately kept out of this
authority-only root layer so this stack does not mutate locked compositions or invent
a second component family.
