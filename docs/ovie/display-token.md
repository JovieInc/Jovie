# Ovie office display token

The office ultra-wide shows Ovie Home, Full Screen, all day with no login.
It does this with a registered device and a read-only session, not an admin
login.

## What it can do

- Read only the Home feeds: `GET /api/hud/metrics`, `/api/hud/shipping-state`,
  `/api/admin/hud/founder-funnel`, `/api/ovie/inbox`.
- Load `/display` (Home, Full Screen, no input).
- Nothing else. Every other route ignores the cookie and demands the normal
  login. `lib/ovie/display/display-scope.test.ts` fails if any other module
  imports the display check or if a feed route gains a write method.

## How it works

1. The Air holds a device secret in its keychain. It never sends it.
2. `scripts/ovie-display-url.sh` computes
   `HMAC-SHA256(secret, "ovie-display:v1:<device>:<unix ts>")` and prints a URL.
3. Opening that URL (`GET /api/ovie/display/session`) verifies the proof (60 s
   clock window, constant-time compare), sets `ovie_display` (HttpOnly, Secure,
   SameSite=Strict, 12 h), and redirects to `/display`.
4. The cookie is an HMAC-signed claim `{scope: ovie-home-read, device, iat, exp}`.
   Each request re-checks the signature, expiry, scope, that the device is
   still registered and enabled, and `iat >= revokedBefore`.
5. A launchd job on the Air re-runs the script and reloads the page every 6 h,
   so the 12 h cookie is always replaced before it expires. If it ever lapses
   the screen shows "This display is not authorized", never company data.

## Server configuration (Doppler, prod)

- `OVIE_DISPLAY_SESSION_KEY`: 32+ random bytes. Signs cookies.
- `OVIE_DISPLAY_DEVICES`: JSON, for example
  `[{"id":"air-office","secret":"<32+ random bytes>"}]`. Optional fields:
  `previousSecret` (rotation), `revokedBefore` (epoch seconds), `disabled`.
  Malformed entries are dropped (a typo removes access, never widens it).
  Both unset means the feature is closed.

## Provision (Tim)

1. `openssl rand -base64 48` twice: one device secret, one session key.
2. Put both in Doppler (`OVIE_DISPLAY_DEVICES`, `OVIE_DISPLAY_SESSION_KEY`).
3. On the Air: `security add-generic-password -s ovie-display-air-office -a "$USER" -w "<device secret>"`.

## Revoke

- One device now: set `"disabled": true` for it, or remove it. Takes effect on
  the next request.
- Sessions minted before now, keep device: set `revokedBefore` to the current
  epoch second.
- Everything: rotate `OVIE_DISPLAY_SESSION_KEY` (signs every display out).

## Rotate the device secret (no downtime)

1. Generate a new secret. Set `secret` = new, `previousSecret` = old.
2. Update the Air keychain (`security add-generic-password -U ...`).
3. Once the Air has minted a session with the new secret, drop `previousSecret`.
   Live sessions survive (they do not depend on the device secret).

## Known limits (for review)

- A proof URL is a bearer for its 60 s window; the redirect sets
  `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, but the URL
  can appear in the browser history and in access logs for that minute. A
  captured proof only yields the same read-only session.
- No server-side replay cache or rate limit on the exchange endpoint yet.
- The session cookie, if stolen from the Air, reads Home data until it
  expires or is revoked. It cannot write.
