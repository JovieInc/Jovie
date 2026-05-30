# Plan: Simplify merch pricing UI around sale price and profit (gh-9802)

**Worker:** grok-worker-2-expanded (expanded code-todo wave, scheduler 019e806ce204, strict filter passed: pure UI/core-flows code refactor on merch pricing display/calc. type:feature + area:ui + area:core-flows. No fundraising/outreach/candidate-followup/ADR/docs. Complementary to worker-4 gh-9803 merch pipeline claim; F-04 smart links (geo/device/platform from LINEAR_ISSUES.md) highest priority but no open gh match this wake — backlog doc only; selected next high-signal unclaimed UI item).

**Issue:** https://github.com/JovieInc/Jovie/issues/9802

**Claim:** grok-worker-2-expanded (sqlite+file+gh fallback, ruflo transport closed; sentinel AGENT_LOOP_TICK_grok-2-expanded; gbrain health 90; no dups with 9872/9874/9803/9791/9750).

**Jovie invariants:** .claude/AGENTS.md + CLAUDE.md + gstack skills (6 principles verbatim below, HOT ZONE only, no permanent docs left in worktree, JOVIE_AGENT_PROFILE=coder, scripts/setup.sh + pnpm gates, /autoplan + tiered /qa + /ship PR-only, pristine cleanup even on error).

## Context & Goal
Simplify the merch pricing UI in artist public profiles (and related seller views) around sale price vs profit. Current display/calc is confusing for creators (list price, sale price, platform fees, profit margin not clear at a glance). Make it obvious, clean, and actionable so artists understand earnings on merch at a glance — high-leverage for launch + merch adoption (pairs with F-series smart links / core-flows).

Focus on display/calc simplification only (no new backend pricing engine, no full catalog changes — those are 9803 scope).

## Premises (per 6 gstack principles + dual-voice gate)
1. Merch pricing clarity directly impacts creator adoption and revenue at launch (valid from merch pipeline + profile merch card usage).
2. "Simplify around sale price and profit" means surface the final take-home number + sale price prominently, de-emphasize or inline the math (explicit over clever).
3. Small targeted UI changes in 2-4 files (ProfileMerchCard, pricing lib helpers, checkout form display) will deliver the value without touching pipeline or schema (boil lakes + bias to action).
4. Existing tests + typecheck + manual visual QA in /qa will catch regressions (pragmatic + completeness).
5. No need for new design system or full merch redesign — incremental polish on existing components (DRY reuse of card patterns).

Premise gate: accepted (no contradictions; small blast radius aligns with 6 principles; F-04 noted as even higher leverage but unblocked by open gh this cycle).

Dual-voice confirmation (I/You): "I will make sale price + profit the hero numbers in the merch card and checkout summary." "You should verify on desktop + mobile that the numbers are scannable and match the profit math in lib/merch/pricing.ts."

## HOT ZONE + Blast Radius (strict — only these files)
**HOT ZONE (only touch these):**
- `apps/web/lib/merch/pricing.ts` (and pricing.test.ts if calc changes) — core sale/profit helpers and formatting.
- `apps/web/components/features/profile/ProfileMerchCard.tsx` (or nearest merch card UI) — primary display of pricing for fans/creators.
- `apps/web/app/[username]/merch/[cardId]/MerchCheckoutForm.tsx` (or page.tsx pricing summary) — buyer-facing sale/profit clarity.
- Minimal related test updates if they live inside the 3 files above.

**Explicitly out of scope (boil lakes applied; rejected expansions):**
- Full merch catalog, generation pipeline, Printful integration, orders, webhooks (9803 scope).
- Any schema/DB changes (lib/db/schema/merch.ts).
- Other merch UI (library, chat merch, admin).
- New features (discount codes, variants beyond pricing display).
- F-04 smart links implementation (no open gh; flag for next cycle).
- Docs, LINEAR_ISSUES.md updates, non-pricing merch components.

Blast radius: < 4 files, < 1 day effort, UI-only visual/calc polish. Zero risk to core flows or data.

## 6 gstack Autoplan Principles (verbatim, applied to every decision)
1. **Choose completeness over cleverness or abstraction.** — Ship the whole focused simplification (clear sale price + profit hero numbers + consistent formatting across card + checkout) in one PR; no half-measures.
2. **Boil lakes, not oceans — aggressive scope pruning to the critical path.** — Only the 3-4 pricing display/calc files; every other merch surface deferred.
3. **Be pragmatic and product-minded — if it works and ships, it is correct.** — Reuse existing card patterns, Tailwind, existing price formatters; no new abstractions unless 1-line obvious win.
4. **DRY (don't repeat yourself) where it reduces maintenance cost without sacrificing clarity.** — Extract or reuse a single `formatMerchProfit` / `SalePriceBadge` helper if duplication exists in the HOT ZONE files; otherwise leave obvious duplication if clearer.
5. **Explicit over clever — readability and debuggability > golfed lines.** — Price math and display logic must be 5-line obvious; comments on fee assumptions; no ternary golf.
6. **Bias toward action — small PRs, incremental value, avoid analysis paralysis.** — One PR, gates pass, open immediately. Flag any follow-ups in comments.

All taste decisions auto-decided per principles. No borderline scope surfaced that requires user input.

## Implementation Steps (gbrain symbol search first, atomic commits)
1. In worktree: JOVIE_AGENT_PROFILE=coder; scripts/setup.sh; pnpm (turbo typecheck baseline).
2. gbrain / rg symbol search first: "salePrice", "profit", "listPrice", "formatPrice", "MerchCard", "pricing" in lib/merch/ and components/features/profile/.
3. Identify current confusion points (e.g. sale price buried, profit calc not shown or wrong on sale).
4. Simplify lib/merch/pricing.ts helpers (clear `getSalePrice`, `getCreatorProfit` with sale-aware math; explicit export).
5. Update ProfileMerchCard.tsx: make sale price + "You earn $X" the prominent elements; clean layout, badges if needed.
6. Update MerchCheckoutForm.tsx (or page summary): mirror the simplified pricing view for buyer confirmation.
7. Atomic commits: "simplify: merch pricing UI — sale price + profit hero numbers (gh-9802)" + any follow-up micro commits.
8. Run full gates: pnpm turbo typecheck --filter @jovie/web; vitest on pricing.test; manual /qa.
9. /ship (PR-only via gstack ship skill; label "grok autonomous"; capture URL immediately; NEVER merge).

gbrain code symbols searched (pre-impl): lib/merch/pricing.ts exports, ProfileMerchCard usage of price fields, existing formatters in lib, merch types.

## Acceptance Criteria (from issue intent + Jovie gates)
- Sale price and creator profit are the clearest, most prominent numbers in ProfileMerchCard and checkout summary.
- Math is correct and consistent (sale price flows through to profit calc).
- No visual regression on desktop/mobile (screenshot evidence in /qa).
- Typecheck + relevant tests pass.
- PR body includes this plan + before/after rationale + "grok autonomous expanded code-todo" + gbrain key.
- Source issue 9802 updated with PR link + qa delta.

## Risks & Mitigations
- Profit calc assumptions wrong on sale: explicit tests + comments in pricing.ts (P5 explicit + P1 completeness).
- Mobile layout breaks: exhaustive /qa tier for UI with screenshots (P6 bias to action + P3 pragmatic).
- Over-scope creep into 9803: strict HOT ZONE enforcement + git diff review before commit (P2 boil lakes).
- Duplicate work: claim + sqlite + gh + monitors (already executed).

## Verification Plan (/qa tier: exhaustive for UI)
- After impl: pnpm turbo typecheck --filter @jovie/web; vitest run pricing.test.ts.
- Exhaustive UI: browse or manual + annotated screenshots of ProfileMerchCard (desktop + mobile simulated) before/after; checkout form pricing section.
- Health score delta (pre/post).
- Ship-readiness summary in PR.

## 6-Month Regret Scenario (CEO)
If pricing remains confusing, artists under-use merch or misprice, hurting launch revenue and retention. This PR removes that friction with minimal surface.

## Dream State Delta
Current: merch card shows list/sale in a way that hides take-home profit.
After: instant clarity — "Sale $29 • You earn $18 after fees" (or equivalent clean UI). Artists ship more merch, fans buy with confidence.
12 months: pricing UI + F-04 smart links + full merch pipeline = seamless creator monetization surface.

## Not in Scope (deferred)
- Full merch redesign or new variants UI.
- Backend pricing engine changes.
- F-04 geo/device/platform smart link routing (file gh issue + claim in future expanded wave when open).
- Any work outside the 3 HOT ZONE files.

**Sentinel:** AGENT_LOOP_TICK_grok-2-expanded 2026-06-01T00:05:33Z
**gbrain outcome key:** outcome-gh-9802-...
**Next after plan:** /autoplan (full review against these 6 principles + HOT ZONE), then implement + /qa + /ship.