# JOV-5909 — World-class wordmark + O animation + plugin-clean favicon: implementation contract

> **Status:** Contract only — design lock pending (Tim). No mark, favicon, or animation code changes ship in this PR.
> **Issue:** [JOV-5909](https://linear.app/jovie/issue/JOV-5909/world-class-wordmark-o-animation-plugin-clean-favicon)
> **Date:** 2026-09-03
> **Taste owner:** Tim. Ops does not merge/deploy.

## 1. Gating state

The issue loop is: Fable 5.1 cooks stills → frontend-skill PASS → stills to Ops chat → recook **until Tim locks** → *then* implementation, contract-first. This document is that contract. Implementation MUST NOT start until all five locked stills exist:

1. 16px favicon
2. 32px splash B (tiny cream mark for the empty field — already locked 2026-09-02, stays)
3. ChatGPT-plugin circle on dark
4. Wordmark lockup
5. Animation frames: wordmark → O

Known state as of 2026-09-03:

- Founder lock on final letterforms: **no** (`gbrain: jovie-identity-lab-o-wordmark-proposal-2026-08-10` — candidate 08 preliminary only).
- Splash lock 2026-09-02: front-facing cream O-ring; after appear, the logo animates down to just the O. No sunburst.
- Temporary shipped wordmark: W775 Satoshi (#15821). Second-pass wordmark follow-up: JOV-4974.

## 2. Locked canon (inputs, not open questions)

From `gbrain: design/jovie-brand-identity-canon` (2026-07-03) and the issue's plugin constraint:

- **The O is the only icon.** No J-mark. Standalone = just the O. Lockup = `Jovie` where the O is the mark.
- Wordmark letterforms share the O's stroke weight.
- Plugin-clean constraint (ChatGPT plugin chrome shows Linear as a filled circle + 3 white strokes): the Jovie mark must survive that size and style — **one geometric O, perfect circles, optical grid, high contrast, no 3D noise, no inner junk**.
- Same mark for favicon, app icon, and plugin composer icon: square 512 source that reads at ~16–32px.

## 3. Current-state facts the implementation must respect

Verified against this checkout (2026-09-03):

- `apps/web/lib/brand/tokens.ts:24` — `JOVIE_PATH` is a ring with a J-hook notch (1043 chars, 360×360 viewBox), **not** a clean O. `OV_PATH` (`tokens.ts:34`) reuses it as a documented placeholder; do not change OV treatment here.
- `apps/web/lib/brand/wordmark-letters.ts` — geometric JOVIE letters, 22u uniform stem, O glyph outer R=50 / inner R=27 (evenodd) already matched to the mark ring ratio.
- `apps/web/lib/brand/primitives.tsx` — `Mark`, `Wordmark` (already supports `markAsO`, lines 113-128), `Lockup`. The layout math the wordmark→O animation needs already exists.
- Favicon chain: `apps/web/public/favicon.svg` (dual-mode ink `#08090a` / cream `#F5F4F0`), `favicon.ico` (manual, not generated), `favicon-{16,32,96}.png`, `apple-touch-icon.png`, `web-app-manifest-{192,512}.png`, `android-chrome-{192,512}.png`; wired in `apps/web/app/layout.tsx:130-149` and `apps/web/app/manifest.ts:20-57`.
- Stale pre-rebrand purple `#6366f1` still in `apps/web/app/layout.tsx:120` (`msapplication-TileColor`) and `:146` (mask-icon color). Fix with the favicon swap.
- Splash: `apps/web/components/organisms/CinematicAppBoot.tsx` is the intended boot surface (forward-only CSS keyframes, sessionStorage once-per-tab, `prefers-reduced-motion` skip) but is **currently unwired** — nothing in `app/` imports it. `apps/web/components/atoms/JovieMarkElectric.tsx` is the live ambient mark. There is **no existing wordmark→O animation**; it is new work.
- Regeneration is single-source: root `pnpm brand:generate` → `scripts/generate-brand-assets.ts` (→ `apps/web/scripts/generate-brand-assets.ts`, sharp rasterizer) regenerates all web PNG/SVG assets, iOS `AppIcon.appiconset`, and desktop icons; `pnpm --filter desktop run prepare:assets` for `.icns`.
- Byte-stable, do-not-regenerate: `public/brand/Jovie-Logo-Icon{,-Black,-White}.svg` (JSON-LD/admin/audit allowlists), `favicon.ico` (manual step).
- Drift guards designed to fail on this change: `apps/web/tests/unit/lib/brand/primitives.test.tsx` (asserts `JOVIE_PATH.length === 1043` and exact substrings) and `apps/web/tests/unit/atoms/BrandLogo.test.tsx` (asserts path bytes). Update in the same PR as the mark change.
- Checksummed manifest `apps/web/public/brand/generated/Jovie-Brand-System.json` (via `lib/brand/public-projection.ts`) drifts on any asset regeneration — regenerate and commit together.
- Icon allowlists: `apps/web/eslint-rules/icon-usage.js:18-28`, `apps/web/scripts/audit-icons.js:19-29`; JSON-LD logo URLs: `apps/web/lib/constants/schemas.ts:30,40`.

## 4. Implementation plan (execute only after Tim's lock)

### Phase A — Tokens (`apps/web/lib/brand/`)

1. Replace `JOVIE_PATH` in `tokens.ts` with the locked O geometry. Requirements: single closed ring from perfect-circle arcs on an optical grid; keep the 360×360 viewBox unless the locked grid says otherwise; stroke/counter ratio stays harmonized with the wordmark O (currently 174:94 ring / R50:R27 glyph).
2. If the lock changes letterforms, update `wordmark-letters.ts` and `WORDMARK_TRACK` together; otherwise leave them.
3. Update drift-guard tests in the same commit (`primitives.test.tsx`, `BrandLogo.test.tsx`).

### Phase B — Plugin-clean favicon + icons

1. Rerun `pnpm brand:generate`; then `pnpm --filter desktop run prepare:assets`.
2. Regenerate `favicon.ico` manually (16/32/48 multi-size) from the locked 512 square source — the one asset the script deliberately skips.
3. Verify `favicon.svg` dual-mode contrast on light and dark chrome; the plugin-circle-on-dark still is the reference.
4. Replace `#6366f1` with ink `#08090a` at `layout.tsx:120` and `:146`.
5. Legibility proof required in the PR: 16px and 32px renders of the favicon, plus the 512 source, attached as images.

### Phase C — Wordmark → O animation

1. Host: `CinematicAppBoot` (reuse its forward-only CSS-keyframes pattern). If the decision is to ship the animation, wire the mount as part of the change — today it is stories/tests only; confirm the intended mount point with DESIGN canon before wiring.
2. Sequence: full `Wordmark` appears → collapses to the O slot using the existing `markAsO` geometry (scale 100/354, `primitives.tsx:113-128`), so no separate artwork and no layout shift — the O's final frame must occupy the same box the wordmark's O occupied.
3. `prefers-reduced-motion`: skip straight to the settled O. Once per tab via the existing sessionStorage pattern.
4. Splash B: the 32px cream mark on the empty field stays exactly as locked 2026-09-02 — do not restyle it.
5. No layout shift in any state transition (`.claude/rules/ui.md`): reserve the wordmark box for the full sequence.

### Phase D — Native + downstream

1. iOS `AppIcon.appiconset` and `Jovie-logo.imageset` regenerate via the script; verify `Contents.json` coverage.
2. `apps/web/lib/wallet/apple/profile-pass.ts:442` and `app/[username]/opengraph-image.tsx` consume `public/Jovie-logo.png` — regenerated, no code change expected.
3. If any asset filename changes, update `icon-usage.js` / `audit-icons.js` allowlists and `schemas.ts` JSON-LD URLs in the same PR; prefer keeping filenames so this step is a no-op.

## 5. Acceptance criteria

- 16px favicon reads as one clean O on light and dark browser chrome; no inner elements.
- 32px splash B mark unchanged from the 2026-09-02 lock.
- Plugin composer icon: square 512 source, reads at 16–32 inside a filled circle on dark.
- Wordmark lockup: O is visually identical to the standalone mark at the same render size.
- Animation: wordmark → O with zero layout shift, reduced-motion fallback, once-per-tab.
- `primitives.test.tsx`, `BrandLogo.test.tsx` updated and green; `pnpm brand:generate` output is byte-reproducible (run twice, no diff).
- Brand-system manifest checksums regenerated and committed.

## 6. Verification commands

```bash
pnpm --filter @jovie/web run typecheck -- --pretty false
pnpm biome check --write <changed paths>
pnpm --filter web exec vitest run tests/unit/lib/brand/primitives.test.tsx tests/unit/atoms/BrandLogo.test.tsx
pnpm brand:generate   # twice; second run must produce no diff
pnpm typecheck:scripts
```

## 7. Rollback

Single revert: `tokens.ts` (+ `wordmark-letters.ts` if touched) and the regenerated assets are deterministic outputs of the tokens. Revert the commit, rerun `pnpm brand:generate`, restore `favicon.ico`. No data, route, or entitlement surface is touched by any phase.

## 8. Out of scope

- OV mark (`OV_PATH`) — separate taste gate on JOV-4083.
- Second-pass wordmark refinement — JOV-4974.
- PR #16419 — leave alone.
- `JovieLogo` legacy inline wordmark (zero production usage) — removal is a separate cleanup, not this issue.

## 9. Optimization-contract exception (declared, justified)

This issue is brand-identity artwork and a boot animation — canonical taste-locked assets, not an optimizable product surface. The optimization contract is **excepted** in full:

- **Variants / exposure / outcome / attribution / context dimensions:** not applicable — there is exactly one canonical mark; exposing variant identities of the brand mark would violate the brand canon itself (the O is the only icon). No analytics, model-experiment, audience-event, YouTube-experiment, or release-to-revenue surface applies to choosing artwork.
- **Hypothesis / primary metric / guardrails:** replaced by the taste gate — Tim's lock on the five stills is the decision procedure; acceptance criteria in §5 are the guardrails.
- **Privacy / consent:** no user data involved.
- **Owner / cadence:** owner is Tim (taste); cadence is the recook loop in the issue, not a metric review.
- **Decision writeback:** the lock is recorded on JOV-5909 and in gbrain (`design/jovie-brand-identity-canon` lineage); this document is the repo-side writeback.
- **Rollback / control:** §7 — deterministic asset regeneration from version-controlled tokens.
