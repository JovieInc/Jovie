# Ovie Shipping Cockpit Runbook

## Canonical surface

The shipping cockpit is part of `/app/admin/ops`, not a separate HUD dashboard. `/hud` is a compatibility redirect for old menu-bar/bookmark links. `/app/admin/ops?mode=kiosk` is the fullscreen admin presentation; `/hud-tv?kiosk=...` is the token-only TV wrapper.

## Local verification

1. Start the web app with the normal Jovie development command.
2. Open `/app/admin/ops` as an admin on `localhost`.
3. Confirm the canonical Ops screen shows:
   - Default-alive/default-live cash/runway/required-income context.
   - Users, activation, retention, conversion, and artist-lift signals.
   - Shipper state, dispatchable queue, in-flight ledger, last result, shipping velocity, and shipped PRs.
   - Alerts/blockers and Taste Inbox summary with Approve, Reject, and Comment write-back.
   - Local sign-in status for Grok, Codex, and Claude where configured.
4. Use `/app/admin/ops?mode=kiosk` for the fullscreen admin view.
5. Use `/hud-tv?kiosk=...` only for a token-authenticated wallboard. It must stay a thin presentation wrapper around the canonical read model.
6. Use **Reauthenticate** only from the local app. It launches the allowlisted CLI login flow; credentials never pass through the browser.

## Safety

- HUD APIs are admin-only and return `no-store` responses.
- Taste actions are idempotent per issue/action/comment and write an audit event.
- Approve and Reject add a decision comment before completing the Linear issue. Comment leaves the issue open.
- CLI auth is localhost-only. No tokens, credential files, or command output are returned to the browser.
- Do not duplicate metric derivations in route wrappers or the deprecated `apps/console` taste-inbox screen.

## Migration / deprecation

- `apps/console` `taste-inbox` remains only as a sweep/ingestion compatibility surface until zero users; its product decision UI is deprecated. Use the Ops drill-in and `/api/admin/hud/taste-inbox`.
- The archived `JovieInc/ovie` Swift repository is launcher-only and read-only. New UI, metrics, and operator workflows belong in canonical Ops in this repository.

## Known local prerequisite

The installed Codex launcher must include its platform vendor binary for the login flow to run. If the launcher reports a missing executable, reinstall the local Codex CLI and retry; the cockpit does not capture or persist credentials.
