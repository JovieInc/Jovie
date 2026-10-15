# Surface convergence census

JOV-8097 measures rollout of [DESIGN.md](../../DESIGN.md), under the existing
world-class UX convergence goal (#16205). It adds no design authority. The
[authority map](../../apps/web/data/designSystem/systemAuthorityMap.json),
[app-screen registry](../../apps/web/data/appScreens/registry.ts) and
[marketing manifest](../../apps/web/data/marketing/routeManifest.ts) still own
components, compositions and route recipes.

The [machine-readable census](../../apps/web/data/designSystem/surfaceCensus.json)
registers every web page source exactly once. `node scripts/design-surface-census.mjs`
prints current counts, percentage, remaining weighted work, rolling 24h/7d
completions, introduced holdouts, regressions and an evidence-based ETA.
Add `--rows` for each surface's URL, source identity and inherited family metadata.
An optional positional base ref replaces `origin/main` for the ratchet comparison.

The unit is a route entrypoint, including dynamic patterns, compatibility routes
and intercepted auth presentations. It is not a visitor count: a redirect needs
destination verification, and a dynamic pattern represents its state family.
The 2026-10-15 source census covers 210 customer/admin/marketing entrypoints;
39 explicitly listed demo/dev/render fixtures are outside that denominator.
Native surfaces retain their [separate inventory](native-ui-convergence-registry.md).

Each row inherits its product area, acquisition/revenue/usage importance (1–3),
expected canonical source owners, known divergence or certification gap,
accountable owner/Linear issue, dated evidence, status and remaining scope.
Split a family into sorted groups when individual routes acquire different
status/evidence. Do not edit an entire family's status after certifying one page.

Status means:

- `canonical`: current composition and applicable states have certification evidence.
- `migrating`: bounded work is underway (Pricing here; admin in JOV-8098).
- `holdout`: divergent, legacy, or lacking current full-surface certification.
  Registration alone is insufficient; this conservative baseline is certification
  debt, not a claim that every such page is visibly broken.
- `intentional_exception`: a named approver, reason and future review date exist.
  There are no seeded exceptions. Internal fixture exclusions are not exceptions.

Marketing holdouts and Pricing's ongoing perceptual refinement belong to
[JOV-8101](https://linear.app/jovie/issue/JOV-8101). Admin shell/table/rail work
belongs to [JOV-8098](https://linear.app/jovie/issue/JOV-8098); remaining product
certification belongs to [JOV-8392](https://linear.app/jovie/issue/JOV-8392).
These open issues own the burn-down; the census does not certify their completion.

## Shrinking ratchet and measurement

The existing `pnpm design:authority:check` gate runs the census check. New page
sources must declare owners/issue/composition or a recognized internal fixture
path. Against the base, existing non-holdouts cannot become holdouts, canonical
surfaces cannot regress, and existing surfaces cannot disappear into exclusions.
Deleted route files may retire. Baseline work weights and the observation start
remain fixed; transition history is append-only. Gate read/Git failures fail closed.
Canonical source digests invalidate stale certification when a page or declared
owner changes. Renew the actual render evidence before updating the digest.

For every status change, append `{source, from, to, at, evidence}` with an observed
UTC timestamp and reviewable evidence. A genuinely new surface starts with
`from: null`; its holdout introduction is visible in both rolling windows.
Initial baseline holdouts do not masquerade as newly introduced regressions.
Certify the upstream owner when a missing primitive causes divergence.

Work weight is acquisition + revenue + usage importance. Remaining weight sums
`holdout` and `migrating` rows; exceptions remain visible in totals but outside
the migration target. Velocity is completed canonical weight over the elapsed
observation window, capped at seven days. ETA = remaining weight / that velocity.
Until at least three completions over 24h with no seven-day regression exist,
the report explicitly returns insufficient observations. The range varies
observed velocity by 0.5–1.5x; it is a sensitivity scenario, not statistical certainty.

**Ship now:** a conservative baseline, Pricing migration and the existing cheap
gate. **Re-evaluate when:** three observed completions span at least 24h.
**Then:** publish the computed range, prioritize the highest remaining weights,
and refresh evidence as each bounded migration lands. Never invent a calendar ETA.

## Pricing certification boundary

Pricing already uses `PublicPageShell`, `MarketingHero`, `MarketingContainer`,
`PricingRecipeBody` and offer-truth data. JOV-8097 removes the minimal-footer
route exception and preserves its page-owned closing CTA. The shared comparison
keeps Artist Presence on one line using the canonical 40% feature column on mobile.
Prices, access intent, JSON-LD and checkout destinations retain their owners.

The static body/footer has anonymous idle, hydrated, narrow/wide and reduced-motion
states. The comparison adds Free/Artist Presence selection and keyboard focus;
selection is an explicit local disclosure. No new async state or failure path is
introduced. Existing visibility-audit loading/hidden/offer states remain separate.
Footer geometry stays fixed after hydration/fonts; navigation intentionally
changes location. Certification checks and captures are recorded with the PR.
Local source/browser evidence, hosted CI, merge and production certification are
separate receipts. The census never claims this branch has deployed.
