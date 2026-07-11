# Ovie

Ovie and Jovie are one codebase with two shells, not two products with forked
implementations. Jovie is the external/consumer shell; Ovie is the
internal/personal/ops shell. Shared packages, components, design system,
contracts, API clients, auth primitives, ledger models, interaction patterns,
and metrics are canonical and must be reused by both shells.

The difference is configuration: shell, route, entitlement, and presentation
mode. Do not create Ovie-specific copies of Jovie UI, data contracts, or
metrics. `/app/admin/ops` remains the canonical Ops surface; Ovie, HUD, and TV
are presentation modes over the shared implementation.

Before pushing documentation changes, run the local brand-scrub and slopcheck
guardrails on the changed files; keep these checks passing without weakening
the scanners.

## Personal finance boundary

The personal finance module belongs in shared code so its contracts and UI can
be reused by either shell, but it has a strict private capability boundary:

- Raw Gmail and Amazon receipts stay local and encrypted.
- Only normalized facts may enter gbrain.
- Access is private/entitlement-gated; never expose personal finance data to
  the consumer shell or public APIs by default.
- No account connections or money movement are part of this architecture yet.

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
| Shared UI and contracts | `packages/` and `apps/web/components/` in this repo |
| Ovie/HUD presentation | `apps/web/app/hud/` in this repo |
| Canonical private Ops | `/app/admin/ops` |
| Shipper loop the old app monitored | `scripts/hermes/` in this repo |
| Ship-ledger contract | `scripts/hermes/lib/ship-ledger.ts` |
| Archived Swift launcher | `JovieInc/ovie` (read-only) |
