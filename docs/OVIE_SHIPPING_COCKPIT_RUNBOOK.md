# Ovie Shipping Cockpit Runbook

## Local verification

1. Start the web app with the normal Jovie development command.
2. Open `/hud` as an admin on `localhost`.
3. Confirm the Shipping Cockpit shows:
   - Taste Inbox decisions with Approve, Reject, and Comment write-back.
   - Shipper state, dispatchable queue, in-flight ledger, last result, and shipped PRs.
   - Local sign-in status for Grok, Codex, and Claude.
4. Use **Reauthenticate** only from the local app. It launches the allowlisted CLI login flow; credentials never pass through the browser.

## Safety

- HUD APIs are admin-only and return `no-store` responses.
- Taste actions are idempotent per issue/action/comment and write an audit event.
- Approve and Reject add a decision comment before completing the Linear issue. Comment leaves the issue open.
- CLI auth is localhost-only. No tokens, credential files, or command output are returned to the browser.

## Known local prerequisite

The installed Codex launcher must include its platform vendor binary for the login flow to run. If the launcher reports a missing executable, reinstall the local Codex CLI and retry; the cockpit does not capture or persist credentials.
