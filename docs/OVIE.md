# Ovie

Ovie is Tim's macOS/iOS door and operations presentation. It is not an agent
persona, model identity, independent memory, or source of truth.

Canonical program: [`docs/OVIE_PROGRAM.md`](OVIE_PROGRAM.md) (JOV-5214).

`Tim -> Ovie -> Eve intake/ack -> durable Kanban -> Summer -> Symphony -> identified coding worker on Gem Ubuntu`

## Canonical Ops contract (JOV-5256)

Packaged-app M1 consumes this exact contract. Do not add a second dashboard,
shell, or Overview/HUD/TV product.

| Field | Value |
|---|---|
| Product name | Ops |
| Route | `/hud` (`APP_ROUTES.HUD`) |
| Component | `HudDashboardClient` |
| Module | `apps/web/lib/ovie/ops-entrypoint.ts` |
| Packaged default | `/hud` (zero extra clicks; no `/app/chat` fallback) |

Presentation modes of the same component and metrics contract:

| Mode | Input | Density | Presentation |
|---|---|---|---|
| Shell | `/hud` | `shell` | `shell` |
| Fullscreen | `/hud?fs=1` | `kiosk` | `shell` |
| Kiosk | `/hud?kiosk=<token>` | `kiosk` | `token` |
| Packaged Mac Ovie (JOV-5298) | `/hud?ovie=mac` | `shell` | `mac` (`OvieMacHud`) |

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
| Packaged Mac/iOS door | Talk + ops presentation. Conversational authority is Summer, after Eve intake. Packaged Ovie menu opens `/hud?ovie=mac`. |
| `/hud` | One Ops screen. Fullscreen `?fs=1`. Unattended TV `?kiosk=TOKEN`. |
| `/app/ov/chat` | Entitled operator door. Must not fall through to artist Jovie chat or self-identify as Ovie. |

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
only**, and the repo is **archived (read-only)** on GitHub. There is no Swift
Mac product transition in this checkout. Current stack and proposed
Swift-control slugs: [`docs/macos/swift-control-invariants.md`](macos/swift-control-invariants.md).

- Deprecation issue: [#12894](https://github.com/JovieInc/Jovie/issues/12894)
- HUD surface: `apps/web/app/hud/page.tsx`
- Program contract: `apps/web/lib/ovie/program.ts`
- Ops entry contract: `apps/web/lib/ovie/ops-entrypoint.ts`
