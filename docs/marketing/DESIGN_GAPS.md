<!--
spec-version: 1.0.0
doc-freshness: docs/marketing/DESIGN_GAPS.md
-->
# Missing-section governance

The normative catalog is `apps/web/data/marketing/designGaps.ts`. This document
explains the repeatable review and conversion workflow; it does not duplicate
proposal records.

## State model

- `approved` production sections live in `MARKETING_SECTIONS` and may be bound
  by production routes.
- `proposed` and `reviewing` records contain grayscale desktop/mobile
  wireframes and may not be production bindings.
- `approved` proposals are review decisions, not components. Their
  `registryTask` must be completed before the proposal becomes `implemented`.
- `rejected` proposals remain in the catalog to prevent repeated proposals.
- `deprecated` and `removed` production sections remain governed by the section
  lifecycle and deprecation ratchet.

Variant status is a separate maturity axis. An `unproven` variant still needs
the existing `humanOptIn` artifact; it does not create a new section type.

## Gap to registry workflow

1. Search `MARKETING_SECTIONS` and recipes for an approved section or approved
   composition that satisfies the need.
2. If none does, add one complete `ProposedSectionRecord` with the next stable
   `PROPOSED-SECTION-NNNN` ID. Identify all affected routes and explain why the
   approved variants are insufficient.
3. Specify both grayscale wireframes using only `surface`, `border`, `muted`,
   and `foreground`. Record hierarchy, density, media placement, responsive
   behavior, and interaction behavior.
4. Review through status/comments. Compact feedback is stored verbatim, for
   example: `PROPOSED-SECTION-0012: approve layout, remove secondary CTA`.
5. Production continues with the closest approved section. The manifest gate
   rejects production bindings to proposed, reviewing, or rejected records.
6. After approval, execute the committed `registryTask`: finalize the typed
   variant contract, assign bounded implementation, add fixture/screenshots,
   migrate all affected routes, verify, then mark `implemented`.

## Current migration matrix

| Routes | Audited actual binding / parity | Open design gap |
|---|---|---|
| `/` | verified `hero` only; homepage recipe mismatch | none |
| `/new` | verified homepage recipe parity | none |
| `/pricing` | verified `hero → pricing → social-proof → comparison → cta`; FAQ missing | none |
| `/launch/pricing` | verified `hero → pricing`; later pricing beats missing | none |
| `/artist-profiles`, `/artist-profile` | verified 12-beat actual order; differs from the 11-beat artist recipe | `PROPOSED-SECTION-0002` proof carousel |
| `/artist-notifications` | verified feature recipe parity | `PROPOSED-SECTION-0001` mode switcher |
| `/pay` | unverified `PayLanding` body; parity intentionally unknown | `PROPOSED-SECTION-0003` pay-flow video split |
| `/download` | verified `hero → feature-grid → how-it-works → feature-grid → faq → cta`; feature recipe mismatch | `PROPOSED-SECTION-0004` platform selector |
| `/voice` | verified `hero → feature-grid → feature-split → cta`; feature recipe mismatch | none |
| `/launch` | verified launch recipe parity | none |
| `/about` | verified `hero → content-prose ×2 → faq`; SEO recipe mismatch | none |
| `/support` | unverified section-type ambiguity in `SupportChannels` | none |
| `/compare/*`, `/alternatives/*` | verified actual sequences; both differ from comparison recipe | none |
| `/blog`, `/blog/category/*` | verified `hero → blog-feed`; capture/CTA recipe beats missing | none |
| `/waitlist` | unverified authenticated success view or redirect | none |
| `/ai`, `/blog/*` articles, `/blog/authors/*`, `/changelog`, `/demo/video`, `/demovideo`, `/investors`, `/renders*` | sanctioned non-composable exemption with empty bindings | none |

Every manifest route carries audited `renderedSections` plus evidence status.
Repeated section IDs are intentional; aliases carry their own explicit list.
`getRouteRecipeParity` compares verified actual order with recipe order. It
returns `null` for unverified/exempt bodies so unknown evidence cannot pass as
parity.
