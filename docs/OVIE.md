# Ovie

**Ovie is the Jovie web app's canonical `/app/admin/ops` surface.** `/hud`
remains a compatibility alias for legacy bookmarks; `/hud-tv?kiosk=...` is the
thin token-authenticated wallboard wrapper.

## History

The original Ovie plan was a standalone Swift menu-bar app at
[`JovieInc/ovie`](https://github.com/JovieInc/ovie). After founder direction
(2026-07), that plan was deprecated: the Swift codebase is a **launcher
only**, and the repo is **archived (read-only)** on GitHub. Do not reference
the Swift repo as the current Ovie surface; any remaining mentions of the
Swift app should be labeled "archived".

- Deprecation issue: [#12894](https://github.com/JovieInc/Jovie/issues/12894)
- Current surface: `apps/web/app/app/(shell)/admin/ops/page.tsx` (canonical Ops)
  with `/hud` and `/hud-tv` presentation/compatibility routes.

## Where things live now

| Concern | Location |
|---|---|
| Ovie UI | `apps/web/app/app/(shell)/admin/ops/` in this repo |
| Legacy `/hud` alias | Redirect only; no metrics or layout |
| TV/wallboard | `apps/web/app/hud-tv/` token wrapper |
| Taste Inbox ingestion | `apps/console/scripts/taste-inbox-sweep.ts` until zero users |
| Shipper loop | `scripts/hermes/` in this repo |
| Ship-ledger contract | `scripts/hermes/lib/ship-ledger.ts` |
| Archived Swift launcher | `JovieInc/ovie` (read-only) |
