# Apple Wallet Profile Pass

Jovie owns the first-party Apple Wallet profile pass stack: pass serials, signing, auth tokens, source links, update registration, and scan analytics.

## Availability

The iOS/mobile pass API is available when the user is authenticated, the profile
is complete, and Apple Wallet signing config is present. It is not gated by a
Statsig rollout flag.

The web dashboard may still use the `APPLE_WALLET_PROFILE_PASS` app flag to hide
or show web-only Wallet affordances while those surfaces are iterated.

## Environment

The pass route and update service fail closed unless the signing config is present:

- `APPLE_WALLET_PASS_TYPE_IDENTIFIER`
- `APPLE_WALLET_TEAM_IDENTIFIER`
- `APPLE_WALLET_SIGNER_CERT_PEM`
- `APPLE_WALLET_SIGNER_KEY_PEM`
- `APPLE_WALLET_SIGNER_KEY_PASSPHRASE` (optional)
- `APPLE_WALLET_WWDR_CERT_PEM`
- `APPLE_WALLET_AUTH_TOKEN_SECRET` (minimum 32 characters)
- `APPLE_WALLET_APNS_PRODUCTION` (`true` or `false`, optional)

PEM values may contain literal `\n`; the signer normalizes them at runtime.

## Production release readiness

Source presence is not release proof. Before JOV-6239 certifies a pass or
JOV-6240 uploads an iOS build, the release operator must run the redacted
signing preflight against the production secret scope:

```bash
doppler run --project jovie-web --config prd \
  --only-secrets=APPLE_WALLET_PASS_TYPE_IDENTIFIER,APPLE_WALLET_TEAM_IDENTIFIER,APPLE_WALLET_SIGNER_CERT_PEM,APPLE_WALLET_SIGNER_KEY_PEM,APPLE_WALLET_SIGNER_KEY_PASSPHRASE,APPLE_WALLET_WWDR_CERT_PEM,APPLE_WALLET_AUTH_TOKEN_SECRET,APPLE_WALLET_APNS_PRODUCTION \
  --no-fallback -- env -u DOPPLER_TOKEN \
  bash apps/ios/scripts/validate-wallet-release-env.sh
```

The preflight prints only a pass/fail summary. It verifies certificate
validity, Pass Type ID and Team ID certificate fields, signer/private-key
pairing, the WWDR signature chain, the 32-character server auth-token minimum,
and production APNs selection. Never paste PEMs, private keys, passphrases, or
pass authorization tokens into logs, issues, or git.

The separate iOS preflight remains
`apps/ios/scripts/validate-testflight-env.sh`; the written archive is checked by
`validate-testflight-artifact.sh`. Fastlane `beta` then proves App Store Connect,
readonly match assets, distribution identity/team, provisioning, and internal
upload. A prior upload does not certify a changed current-main build.

### JOV-6235 redacted readiness receipt

Observed 2026-09-29 against `origin/main`
`686972c22482f6e367c4826b243ffa44052c527a`. Status is intentionally
fail-closed; only a new exact-current-main operator receipt may replace a
blocker.

| Prerequisite | Environment / revision checked | Evidence | Owner | Next action |
| --- | --- | --- | --- | --- |
| Ownership and duplicate work | Linear + GitHub at the source SHA | JOV-6235 is In Progress, owned by Tim White, with this Codex lane active; JOV-6236/6237/6238 are Done and JOV-6239/6240 are Backlog; no competing Wallet/TestFlight PR was open | JOV-6235 lane | Keep one workpad and one draft PR |
| Exact production generation | Production build-info + GitHub current main | **Blocked:** production serves `d12f22983e2ec0a4ea2a3b411708a181633b6a2c`, not current main; exact-main controller run `36544292759` had not produced Production Verified at observation time | Production controller | Let the controller resolve normally, deploy current main, then obtain Production Verified before JOV-6239/JOV-6240 |
| Pass Type ID / Team ID / signer validity / key pairing / WWDR | Production Doppler scope | **Blocked:** this lane had no authorized Doppler token, so presence is not treated as validity; the new redacted preflight is ready for the release operator | Release operator | Run the command above; remediate in secret storage only, then attach its redacted receipt to JOV-6235 |
| Server pass auth-token secret and production APNs | Production Doppler scope | **Blocked:** not readable from this lane; source requires a 32-character secret and production readiness requires APNs production mode | Release operator | Run the same preflight; never disclose the secret or pass tokens |
| Wallet tables and founder account/profile row | Production database at deployed `d12f229…` | Production migration and verification succeeded in controller run `36522167198`; **blocked** on a redacted read proving the founder UUID selects one active user, one owned complete public active profile, and the Wallet tables/row state | Release operator / DB owner | Use `scripts/db/prod-read.mjs` under `jovie-web/prd`, selecting the founder via `OVIE_SUMMER_FOUNDER_APP_USER_ID`, not a hardcoded email; attach booleans/counts only |
| Logged-out canonical profile | `https://jov.ie/tim` on deployed `d12f229…` | **Pass for public destination:** HTTP 200 without a session, no redirect, canonical URL equals `https://jov.ie/tim`, all six public-integrity checks passed, and 21 internal links had no failure | Profile owner | Re-run `certify-artist-profile.ts` after exact-current-main deployment; public HTTP does not prove account ownership |
| Existing Wallet serial and share URL continuity | Current source + production DB | Source updates retain the existing serial and source-link-backed share URL; **blocked** on a redacted production read of whether Tim already has a pass and whether both stored fields remain populated. No issuance was attempted here | JOV-6235, then JOV-6239 | Record only row count and boolean/hash continuity; do not log serials, share codes, or auth-token hashes |
| iOS signing, App Store Connect, provisioning, internal upload | GitHub Actions / last upload `1afe106101bbf695635de01764c11bf7ee4478a1` | Last proven internal upload was run `34728918380` on 2026-09-13. It proves that historical build only. There are 89 iOS/auth/release-path files changed between it and checked current main | iOS release owner | Let the canonical TestFlight workflow validate secrets, run full regression, fetch readonly match assets, and upload only after exact Production Verified evidence |
| Current auth and internal/dogfood eligibility | Deployed `d12f229…` + current source | Deployed post-deploy auth smoke passed in run `36522167198`; source grants iOS alpha access to authenticated users without a test-account allowlist. **Blocked** on a real founder-session check, configured install destination, and current-build regression | Auth owner / Tim | Verify Tim's real account and `/api/mobile/v1/me` on the exact deployed current-main build; do not substitute the synthetic auth identity |

Ship now: the redacted validator and evidence contract. Re-evaluate when the
release operator supplies production signing, database, real-account, and
exact-current-main receipts. Then: unblock JOV-6239 certification; only its
success may unblock the JOV-6240 internal TestFlight release.

## Product Contract

Ship now: first-party generic PassKit profile card with update service.

Re-evaluate when: pass generation p95 exceeds 1s at 10k monthly downloads, or Wallet ops exceeds 4 engineer-hours/month for two consecutive months.

Then: move generation and push work behind an internal queue/service boundary while keeping Jovie-owned pass data.

EVENT: the Wallet pass is not a payment instrument. It opens the profile; payment, tip, and booking flows stay on the profile page.

## Data Flow

1. iOS or mobile web requests `GET /api/wallet/apple/profile-pass`.
2. The backend checks profile readiness and Apple signing config.
3. Jovie creates or updates exactly one active Wallet `audienceSourceLinks` row per profile/pass type.
4. Jovie signs a generic `.pkpass` with a QR code to the tracked `/s/[code]` source link.
5. Apple Wallet registers devices through `/api/wallet/apple/v1/...`.
6. Profile changes mark the pass dirty, bump the update tag, and attempt PassKit push notifications without blocking profile saves.

Wallet scans are classified as `wallet_pass` source activity instead of generic short links.
