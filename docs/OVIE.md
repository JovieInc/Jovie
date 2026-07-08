# Ovie

**Ovie is the Jovie web app's `/hud` route.** The canonical Ovie surface is
`apps/web/app/hud/` (admin Ops HUD), served by the production web app.

## History

The original Ovie plan was a standalone Swift menu-bar app at
[`JovieInc/ovie`](https://github.com/JovieInc/ovie). After founder direction
(2026-07), that plan was deprecated: the Swift codebase is a **launcher
only**, and the repo is **archived (read-only)** on GitHub. Do not reference
the Swift repo as the current Ovie surface; any remaining mentions of the
Swift app should be labeled "archived".

- Deprecation issue: [#12894](https://github.com/JovieInc/Jovie/issues/12894)
- Current surface: `apps/web/app/hud/page.tsx` (+ `/hud/wiki`, see
  `docs/solutions/wiki-phase-1.md`)

## Where things live now

| Concern | Location |
|---|---|
| Ovie UI | `apps/web/app/hud/` in this repo |
| Shipper loop the old app monitored | `scripts/hermes/` in this repo |
| Ship-ledger contract | `scripts/hermes/lib/ship-ledger.ts` |
| Archived Swift launcher | `JovieInc/ovie` (read-only) |
