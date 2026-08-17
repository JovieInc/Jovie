# Ovie

**Ovie is one screen: `/hud`.**

Need first (morning walk, cash/MRR, factory health, shipper). Noise below (design jury, velocity, agent runs). Fullscreen is `?fs=1`. Unattended TV is `?kiosk=TOKEN`.

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
- Current surface: `apps/web/app/hud/page.tsx`
