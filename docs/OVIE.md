# Ovie

Ovie is Tim's macOS/iOS door and operations presentation. It is not an agent
persona, model identity, independent memory, or source of truth.

Canonical program: [`docs/OVIE_PROGRAM.md`](OVIE_PROGRAM.md) (JOV-5214).

`Tim -> Ovie -> Eve intake/ack -> durable Kanban -> Summer -> Symphony -> identified coding worker on Gem Ubuntu`

## Canonical product and Ops contract (JOV-5256)

The packaged product is Jovie and opens the canonical shared chat first. Ovie
is an authorized-admin secondary agent and operations surface inside Jovie's
shared shell and components. Do not add a second app, chat presentation,
dashboard, shell, or Overview/HUD/TV product.

| Field | Value |
|---|---|
| Packaged product identity | Jovie |
| Packaged default | `/app/chat` (`APP_ROUTES.CHAT`) |
| Secondary Ops name | Ops |
| Secondary Ops route | `/hud` (`APP_ROUTES.HUD`) |
| Component | `HudDashboardClient` |
| Module | `apps/web/lib/ovie/ops-entrypoint.ts` |

The packaged Mac source owner is `apps/desktop/src/main.ts`, where
`APP_ENTRY_URL` defaults to `/app/chat`. `/hud` is never a packaged default.

Presentation modes of the same component and metrics contract:

| Mode | Input | Density | Presentation |
|---|---|---|---|
| Shell | `/hud` | `shell` | `shell` |
| Fullscreen | `/hud?fs=1` | `kiosk` | `shell` |
| Kiosk | `/hud?kiosk=<token>` | `kiosk` | `token` |

Compatibility aliases, never independent screens:

| Old URL | Now |
|---|---|
| `/app/ov` | Redirects to `/hud` |
| `/app/ov/ops` | Redirects to `/hud` (`?mode=kiosk` → `/hud?fs=1`) |
| `/hud-tv` | Redirects to `/hud` (keeps `?kiosk=`, otherwise `?fs=1`) |

Scan-first need band: Needs Tim, survival (cash/MRR), customer bottleneck,
delivery proof, operating chain. Velocity, activity, agent runs, design jury,
walk capture, dispatch, and developer controls stay in disclosure.

## Presentation surfaces

| Surface | Role |
|---|---|
| Packaged Mac/iOS door | Jovie opens `/app/chat`. Conversational authority is Summer after Eve intake; Ovie and Ops remain secondary authorized-admin destinations. |
| `/app/chat` | Canonical shared chat presentation. Jovie is the default identity; an authorized founder-door selection may bind typed Ovie identity and permissions without forking the chat surface. |
| `/hud` | Secondary Ops screen, linked from canonical admin navigation and protected by admin authorization (or an explicitly provisioned kiosk token). Fullscreen `?fs=1`; unattended display `?kiosk=TOKEN`. |
| `/app/ov/chat` | Admin compatibility entry owned by JOV-5211 authorization reconciliation. It is not a packaged default or an independent shell. |

## Shared chat invariant

Jovie and Ovie use the same canonical chat presentation and behavior. Any Ovie
variation must enter through typed agent identity, permission, data scope, or
capability. Route-specific component forks, competing shells, and duplicated
chat state are forbidden. JOV-5211 owns authorization and route convergence;
this contract does not duplicate that work.

Exact packaged-runtime proof of the `/app/chat` first screen remains pending
host permission. Source, contract, and unit evidence do not substitute for that
runtime receipt.

## Ubuntu operational truth (JOV-5248)

Read-only projection `ovie.shipping-state.v1` at `GET /api/hud/shipping-state`.
It composes Symphony runtime/task state, lease-guard capacity, native
`mergeQueueEntry`, exact-SHA CI, Production Controller, live build-info, and
the typed fleet receipt. JOV-5249 consumes freshness UX. Shutdown retains the
expired last-known marker. No Mac-journal fallback, merged-PR-as-shipped, or
dispatch/retry/cancel/restart surface.

If you are already signed in as admin, Fullscreen fetches `/api/hud/kiosk-session` and writes the token onto the URL so the same tab can be bookmarked or thrown on a display.

## History

The original Ovie plan was a standalone Swift menu-bar app at
[`JovieInc/ovie`](https://github.com/JovieInc/ovie). After founder direction
(2026-07), that plan was deprecated: the Swift codebase is a **launcher
only**, and the repo is **archived (read-only)** on GitHub.

- Deprecation issue: [#12894](https://github.com/JovieInc/Jovie/issues/12894)
- HUD surface: `apps/web/app/hud/page.tsx`
- Program contract: `apps/web/lib/ovie/program.ts`
- Ops entry contract: `apps/web/lib/ovie/ops-entrypoint.ts`
