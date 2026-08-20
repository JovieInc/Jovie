# Ovie

Ovie is Tim's macOS/iOS door and operations presentation. It is not an agent
persona, model identity, independent memory, or source of truth.

Canonical program: [`docs/OVIE_PROGRAM.md`](OVIE_PROGRAM.md) (JOV-5214).

`Tim -> Ovie -> Eve intake/ack -> durable Kanban -> Summer -> Symphony -> identified coding worker on Gem Ubuntu`

## Presentation surfaces

| Surface | Role |
|---|---|
| Packaged Mac/iOS door | Talk + ops presentation. Conversational authority is Summer, after Eve intake. |
| `/hud` | One morning ops screen (brief, walk, shipper, dashboard). Fullscreen `?fs=1`. Unattended TV `?kiosk=TOKEN`. |
| `/app/ov/chat` | Entitled operator door. Must not fall through to artist Jovie chat or self-identify as Ovie. |

If you are already signed in as admin, Fullscreen fetches `/api/hud/kiosk-session` and writes the token onto the URL so the same tab can be bookmarked or thrown on a display.

## Aliases

| Old URL | Now |
|---|---|
| `/app/ov/ops` | Redirects to `/hud` (`?mode=kiosk` → `/hud?fs=1`) |
| `/hud-tv` | Redirects to `/hud` (keeps `?kiosk=`) |

Admin Overview stays a health launchpad. Its Ops tile opens `/hud`.

## History

The original Ovie plan was a standalone Swift menu-bar app at
[`JovieInc/ovie`](https://github.com/JovieInc/ovie). After founder direction
(2026-07), that plan was deprecated: the Swift codebase is a **launcher
only**, and the repo is **archived (read-only)** on GitHub.

- Deprecation issue: [#12894](https://github.com/JovieInc/Jovie/issues/12894)
- HUD surface: `apps/web/app/hud/page.tsx`
- Program contract: `apps/web/lib/ovie/program.ts`
