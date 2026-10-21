# Ovie

Ovie is Tim's macOS/iOS door and operations presentation. It is not an agent
persona, model identity, independent memory, or source of truth.

Canonical program: [`docs/OVIE_PROGRAM.md`](OVIE_PROGRAM.md) (JOV-5214).

`Tim -> Ovie -> Eve intake/ack -> durable Kanban -> Summer -> Symphony -> identified coding worker on Gem Ubuntu`

Hermes and Trigger.dev are retired. Eve is Summer's approved durable target,
but the Summer identity is unavailable until exact deployment and conversation
receipts prove it. Ovie must not fall back to a local executor.

## Ovie Home and the Ops contract (JOV-5959, JOV-5256)

EVENT: founder decision 2026-10-20 (`canon/PRODUCT.md`, "Jovie and Ovie
mirror one shell"). Ovie Home at `/app/ov` is the default door: the shared
composer with the living company-loop canvas above it. Both packaged doors
open it. The full Ops dashboard stays one product, now at `/app/ov/ops`.
Do not add a second dashboard, shell, or Overview/HUD/TV product.

| Field | Value |
|---|---|
| Home | `/app/ov` (`APP_ROUTES.OV`); `/app/ov/chat` renders the same Home |
| Ops product name | Ops |
| Ops route | `/app/ov/ops` (`APP_ROUTES.ADMIN_OPS`) |
| Component | `HudDashboardClient` |
| Module | `apps/web/lib/ovie/ops-entrypoint.ts` |
| Packaged default | `/app/ov` (zero extra clicks; no `/app/chat` fallback) |

Presentation modes of the same component and metrics contract:

| Mode | Input | Density | Presentation |
|---|---|---|---|
| Shell | `/app/ov/ops` | `shell` | `shell` |
| Fullscreen | `/hud?fs=1` | `kiosk` | `shell` |
| Kiosk | `/hud?kiosk=<token>` | `kiosk` | `token` |
| Packaged Mac Ovie (JOV-5298) | `/hud?ovie=mac` | `shell` | `mac` (`OvieMacHud`) |

Compatibility aliases, never independent screens:

| Old URL | Now |
|---|---|
| `/hud` | Redirects to Home at `/app/ov` (kiosk tokens and `?fs=1` keep the isolated Ops presentation) |
| `/hud?ovie=mac` | Redirects to Home at `/app/ov` |
| `/hud-tv` | Redirects to `/hud` (keeps `?kiosk=`, otherwise `?fs=1`) |

Scan-first need band: Needs Tim, survival (cash/MRR), customer bottleneck,
delivery proof, operating chain. Velocity, activity, agent runs, design jury,
walk capture, dispatch, and developer controls stay in disclosure.

## Presentation surfaces

| Surface | Role |
|---|---|
| Packaged Mac/iOS door | Talk + ops presentation. Conversational authority is Summer, after Eve intake. Both packaged doors open Home at `/app/ov`. |
| `/app/ov` | Ovie Home: composer plus the living company-loop canvas. |
| `/app/ov/ops` | One Ops screen. Fullscreen `/hud?fs=1`. Unattended TV `/hud?kiosk=TOKEN`. |
| `/app/ov/chat` | Same Home; entitled operator door. Must not fall through to artist Jovie chat or self-identify as Ovie. |

## Ubuntu operational truth (JOV-5248)

Read-only projection `ovie.shipping-state.v1` at `GET /api/hud/shipping-state`.
It composes Symphony runtime/task state, lease-guard capacity, native
`mergeQueueEntry`, exact-SHA CI, Production Controller, live build-info, and
the lanes feed, lane pull requests, and Summer runtime health. When
`HUD_GEM_BRIDGE_URL`/`HUD_GEM_BRIDGE_TOKEN` are set, the Gem-authored
`lanes-status` receipt is read over the authenticated bridge at its fixed
`/receipts/<source>` key; otherwise the publisher keeps its honest public
feed reads or explicit `unavailable`. The terminal-failure count never
aliases blocked work, and ship time is measured only between observations
with matched work/build identity. JOV-5249 consumes freshness UX. Shutdown retains the
expired last-known marker. No Mac-journal fallback, merged-PR-as-shipped, or
dispatch/retry/cancel/restart surface.

The Summer Kanban projection (`SummerKanbanCard` in
`apps/web/lib/ovie/summer-kanban.ts`, JOV-5761) extends the same conventions:
every card carries per-source freshness in the shipping-state observation
vocabulary (`fresh` / `stale` / `unknown`, never fresh on missing data), the
accountable next action and next proof derived from its routing state and
reason, and the terminal evidence reference once the card lands. All three are
derived at read time from the existing initiative record — nothing is stored —
and Eve remains denied from card transitions.

If you are already signed in as admin, Fullscreen fetches `/api/hud/kiosk-session` and writes the token onto the URL so the same tab can be bookmarked or thrown on a display.

## History

The original Ovie plan was a standalone Swift menu-bar app at
[`JovieInc/ovie`](https://github.com/JovieInc/ovie). After founder direction
(2026-07), that plan was deprecated: the Swift codebase is a **launcher
only** and read-only by policy. The GitHub repository is not currently
archived (API checked 2026-10-02); that does not revive its deprecated Swift
implementation. The accepted
[native Mac direction](macos/ADR-swift-native-mac.md) reuses iOS client
foundations and plans Ovie as a surface of one native Mac product; it does not
revive that deprecated Swift implementation. Electron remains shipped until
qualified cutover. Current stack and proposed
Swift-control slugs: [`docs/macos/swift-control-invariants.md`](macos/swift-control-invariants.md).

- Deprecation issue: [#12894](https://github.com/JovieInc/Jovie/issues/12894)
- HUD surface: `apps/web/app/hud/page.tsx`
- Program contract: `apps/web/lib/ovie/program.ts`
- Ops entry contract: `apps/web/lib/ovie/ops-entrypoint.ts`
