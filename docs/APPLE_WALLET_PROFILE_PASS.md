# Apple Wallet Profile Pass

Jovie owns the first-party Apple Wallet profile pass stack: pass serials, signing, auth tokens, source links, update registration, and scan analytics.

## Runtime Gate

- App flag: `APPLE_WALLET_PROFILE_PASS`
- Statsig gate: `apple_wallet_profile_pass`
- Default: off

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

## Product Contract

Ship now: first-party generic PassKit profile card with update service.

Re-evaluate when: pass generation p95 exceeds 1s at 10k monthly downloads, or Wallet ops exceeds 4 engineer-hours/month for two consecutive months.

Then: move generation and push work behind an internal queue/service boundary while keeping Jovie-owned pass data.

EVENT: the Wallet pass is not a payment instrument. It opens the profile; payment, tip, and booking flows stay on the profile page.

## Data Flow

1. iOS or mobile web requests `GET /api/wallet/apple/profile-pass`.
2. The backend checks the gate, profile readiness, and Apple signing config.
3. Jovie creates or updates exactly one active Wallet `audienceSourceLinks` row per profile/pass type.
4. Jovie signs a generic `.pkpass` with a QR code to the tracked `/s/[code]` source link.
5. Apple Wallet registers devices through `/api/wallet/apple/v1/...`.
6. Profile changes mark the pass dirty, bump the update tag, and attempt PassKit push notifications without blocking profile saves.

Wallet scans are classified as `wallet_pass` source activity instead of generic short links.
