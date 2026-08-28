# ADR — Control Swift work on iOS and Mac (no rewrite)

> Issue: JOV-5359
> Status: Proposed (reviewed-invariant candidates, not adopted)
> Date: 2026-08-28
> Founder ask: investigate Mac architecture + Swift transition; recommend at most 4 control invariants
> Coordination: gbrain-unavailable (CLI missing; MCP empty). Granola and Slack MCP unavailable this session.

This is an investigation receipt. It does **not** authorize a Swift rewrite, merge, or deploy. It does **not** add rows to `canon/invariants.jsonl`. Adoption requires a production consumer and a deliberate-red test ([JOV-INV-004](../canon/invariants.jsonl)). Candidate follow-up: [JOV-5360](https://linear.app/jovie/issue/JOV-5360).

**Ship now:** treat the four slugs below as reviewed control rules for iOS/Mac Swift work.
**Re-evaluate when:** a founder `EVENT:` decision names a new Mac product shell, or packaged dogfood proves Electron load-truth is the bottleneck and a native shell removes it.
**Then:** adopt winners into `canon/invariants.jsonl` with consumers (JOV-5360).

---

## 1. Current Mac stack (verified from this repo)

The customer Mac app is **Electron wrapping the hosted web app**. It is not a native Swift product, not a WKWebView shell, and not a Codex/ChatGPT desktop.

| Surface | Runtime | Role |
|---|---|---|
| Packaged `Jovie.app` / Jovie Local / Jovie Staging | Electron 43 (`apps/desktop`), `BrowserWindow` + preload, `webviewTag: false` | Product shell. Loads hosted Next (`APP_URL`). Local userData = `Jovie-Local`. Default entry `/app/chat`. |
| Packaged Ovie | Same Electron process | Menu opens `/hud?ovie=mac` (`apps/desktop/src/ovie-door.ts`). One heads-up. |
| Electron tray | Same Electron process (`apps/desktop/src/tray.ts`) | Chat / new-message / preferences. |
| `apps/macos/MenuMonitor` | Native SwiftUI `MenuBarExtra` | Operator shipping-count menu. Not the product app. |
| iOS `apps/ios` | Native SwiftUI | Product app. WKWebView only for public-profile preview (`PublicProfileBrowserView.swift`). |
| Archived `JovieInc/ovie` | Swift menu-bar (read-only) | Deprecated launcher. Not the HUD. |

Key files: `apps/desktop/src/main.ts`, `apps/desktop/src/ovie-door.ts`, `apps/desktop/src/renderer-recovery.ts`, `apps/desktop/electron-builder.yml` (`appId: app.jov.ie`), `apps/macos/MenuMonitor/README.md`, `docs/OVIE.md`.

Hunches discarded:

- **Codex/ChatGPT shell as architecture.** False. Historical chrome copied Codex-style back/forward. Runtime is Electron + hosted Next.
- **Mac is already Swift or WKWebView-hybrid.** False. Chromium renderer. `webviewTag: false`.
- **An active Swift rewrite plan exists.** False. The opposite decision already shipped.

---

## 2. Swift transition plan: none (deprecated)

| Artifact | Status | What it decided |
|---|---|---|
| [JOV-3854](https://linear.app/jovie/issue/JOV-3854) / [#12894](https://github.com/JovieInc/Jovie/issues/12894) | Done / closed | Standalone Swift Ovie is the wrong shape. New work is Jovie web `/hud`. Swift is a launcher. No new Swift design tokens. |
| `docs/OVIE.md` History | Canonical | `JovieInc/ovie` archived read-only after 2026-07 founder direction. |
| [JOV-5298](https://linear.app/jovie/issue/JOV-5298) / [#16414](https://github.com/JovieInc/Jovie/pull/16414) | Merged 2026-08-28 | Packaged Ovie is one web screen (`OvieMacHud`) with three YC metrics. Isolated UI lane. **merged ≠ live** until packaged/local dogfood. |
| `docs/OVIE_PROGRAM.md` M1 | not-passed | Real packaged Ovie door + Summer + Ubuntu shipping-state. Source/PR/CI are progress, not done. |

There is no open Linear issue or ADR that authorizes rewriting `apps/desktop` in Swift.

Allowed Swift today: iOS product (`apps/ios`), MenuMonitor (`apps/macos/MenuMonitor`), and the archived Ovie launcher. Forbidden without a founder `EVENT:`: a second Mac product shell, a Swift HUD, or remocked atoms.

---

## 3. Real performance and reliability holes

These are Electron/hosted-load problems. A Swift rewrite does not remove them, and several are already ticketed.

1. **Dual process, dual clock.** Electron main + Chromium renderer, plus (Local) Next on loopback. First compile was measured ~15.5s with 0 bytes on an 8s curl ([JOV-5339](https://linear.app/jovie/issue/JOV-5339)). Packaged watchdogs are 18s load / 14s boot (`renderer-recovery.ts`). Local now skips those watchdogs; packaged still depends on hosted `APP_URL`.
2. **Recovery lying about offline.** JOV-5339: Jovie Local painted “couldn't load / check your connection” during healthy compile/HMR. Marked Done in Linear after #16434 / #16437. **A PR is not a Mac receipt.** The 5-day closed loop ended ~2026-08-28.
3. **Black window / 200-but-blank renderer.** [JOV-3595](https://linear.app/jovie/issue/JOV-3595), [JOV-5086](https://linear.app/jovie/issue/JOV-5086) (packaged 26.7.0). Recovery exists in source. Packaged users only see it after a desktop release.
4. **Main-process interceptor on every response.** [JOV-5290](https://linear.app/jovie/issue/JOV-5290) (Todo): `desktop-csp-watchdog` `onHeadersReceived` has no URL filter. P2, not a rewrite trigger.
5. **merged ≠ live for Ovie.** #16414 changed hosted `/hud?ovie=mac`. Packaged `Jovie.app` pointed at production does not show it until that web SHA is deployed **and** the app reloads. Summer already named this `ops/reviewed-invariants/mac-ovie-empty-hud-is-red-v1`.
6. **Two menu-bar owners.** Electron tray (product) and MenuMonitor (ops). Do not add a third Swift menu as a HUD.

Electron startup/memory evidence is still “required” in `PERFORMANCE.md` (JOV-2712). Target on paper: start < 3s, stable RSS, no renderer crashes.

---

## 4. Four reviewed-invariant slugs (proposed)

Slug shape matches existing Summer receipts (`ops/reviewed-invariants/mac-ovie-empty-hud-is-red-v1`). These are **reviewed candidates**, not executable registry rows.

### `ops/reviewed-invariants/macos-product-shell-is-electron-v1`

The customer Mac app is Electron in `apps/desktop` loading hosted Jovie. Forbidden: a Swift, WKWebView, or Codex-shell rewrite of that product window, or a second desktop binary that claims to be Jovie.app. Measure: `apps/desktop/src/main.ts` remains the `BrowserWindow` owner; no new `apps/macos/*` product target; `webviewTag` stays false.

### `ops/reviewed-invariants/native-swift-locked-atoms-v1`

Swift on iOS and Mac consumes the one design system. Locked atoms stay ActionButton 32 / 510 / r999 and empty-greeting type 28 / 620 (`JovieActionButtonMetrics`, `JovieFont.emptyGreeting*`). Forbidden: remocking those atoms, new Swift token files, or Pen/source-bound mocks that fork them. Measure: `cta-label-weight` + `AppShellChatFirstTests` keep failing on 400/590/600 and on height/radius drift; `scripts/ios-best-practices-lint.sh` stays required for any new Swift tree.

### `ops/reviewed-invariants/ovie-one-hud-no-second-surface-v1`

Ovie inside packaged Jovie.app is the one heads-up: `/hud?ovie=mac` (`ovieOperatorOpsHref`). Forbidden: a second HUD, a Swift Ovie UI, promoting the Ubuntu TUI or MenuMonitor to Ovie, or reopening seven-band `/hud` as the Mac default. Measure: `apps/desktop/scripts/ovie-door.test.ts` and `OvieMacHud` tests; packaged menu still loads that href only.

### `ops/reviewed-invariants/mac-closed-loop-merged-is-not-live-v1`

Visible Mac/iOS work is done only on packaged `Jovie.app` or Jovie Local dogfood, not on merge, CI, or a Linux checkout. Allowed: isolated UI / source-bound / fast-track-ui lanes without a full suite. Forbidden: calling compile/HMR “offline”, treating #16414 as live, or blocking a UI atom PR on unrelated E2E. Measure: typed proof tiers in `docs/OVIE_PROGRAM.md`; recovery classification tests in `renderer-recovery.test.ts`; a Mac screenshot or receipt before `M1 PASSED` / HUD Done.

---

## 5. How to tell this investigation is done

- Current Mac stack is named (Electron + hosted web; Swift only on iOS + MenuMonitor + archived launcher).
- Transition plan is named: **none**. JOV-3854 already killed the Swift Ovie product.
- Four slugs above, one-sentence rules, allowed / forbidden / measure.
- No rewrite, no merge, no deploy from this branch.

Adoption of the slugs is JOV-5360, not this ADR.
