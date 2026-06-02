# Platform Parity Audit

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Scope

This audit compares functional parity across Web, iOS, Electron, and Chrome
Extension for authentication, chat, artist onboarding, profile management,
links, alerts, tipping, account management, billing, and platform-specific
constraints.

## Current Matrix

| Capability | Web | iOS | Electron | Chrome Extension |
| --- | --- | --- | --- | --- |
| Sign in and sign out | Evidence required under JOV-2712 | Deterministic callback, real-browser callback, and live-auth evidence current for `9e9200348e` | Evidence required under JOV-2712 | Evidence required under JOV-2712 |
| Account creation and onboarding | Evidence required under JOV-2712 | Screenshot smoke includes needs-onboarding state | Evidence required under JOV-2712 | Evidence required under JOV-2712 |
| Profile rendering | Evidence required under JOV-2712 | Screenshot smoke includes profile state | Evidence required under JOV-2712 | Evidence required under JOV-2712 |
| Chat shell | Evidence required under JOV-2712 | Screenshot smoke includes chat state | Evidence required under JOV-2712 | Evidence required under JOV-2712 |
| Settings/account management | Evidence required under JOV-2712 | Screenshot smoke includes settings state | Evidence required under JOV-2712 | Evidence required under JOV-2712 |
| Billing and subscription management | Evidence required under JOV-2712 | Evidence required under JOV-2712 | Evidence required under JOV-2712 | Evidence required under JOV-2712 |

## Acceptance Checks

| Check | Status |
| --- | --- |
| Functionally equivalent behavior where platform constraints allow it | Evidence required under JOV-2712 |
| Platform-specific limitations are documented | Evidence required under JOV-2712 |
| Auth and chat behave consistently across clients | Evidence required under JOV-2712 |
