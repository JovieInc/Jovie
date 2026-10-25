# Ovie office display token

The office ultra-wide shows Ovie Home, Full Screen, all day with no login.
It does this with a registered device and a read-only session, not an admin
login.

## What it can do

- Read only the Home feeds: `GET /api/hud/metrics`, `/api/hud/shipping-state`,
  `/api/admin/hud/founder-funnel`, `/api/ovie/inbox`.
- Load `/display` (Home, Full Screen, no input) and `/display/connect`.
- Nothing else. Every other route ignores the cookie and demands the normal
  login. `lib/ovie/display/display-scope.test.ts` fails if any other module
  imports the display check or if a feed route gains a write method.

## How it works

1. The Air holds a device secret in its keychain. It never sends it.
2. `scripts/ovie-display-url.sh` computes
   `HMAC-SHA256(secret, "ovie-display:v1:<device>:<unix ts>")` and prints
   `https://<origin>/display/connect#<device>.<ts>.<proof>`. The proof is in the
   URL fragment, which browsers never send to a server, so it is in no access log.
3. `/display/connect` strips the fragment from the address bar, POSTs the proof
   to `POST /api/ovie/display/session` (there is no GET), and on success moves
   to `/display`.
4. The server accepts a proof at most 60 s old and 5 s ahead, compares in
   constant time, spends it once (Redis `SET NX` per device and timestamp), and
   rate limits attempts (10 a minute). All of this fails closed when Redis is
   unavailable. It then sets `ovie_display` (HttpOnly, Secure, SameSite=Strict,
   12 h): an HMAC-signed `{scope: ovie-home-read, device, iat, exp}`.
5. Every display request re-checks signature, expiry, scope, that the device is
   still registered and enabled, `iat >= revokedBefore`, and the runtime
   revocation keys in Redis (below). If Redis cannot answer, the request is
   denied.
6. A launchd job on the Air re-runs the script and reloads the page every 6 h,
   so the 12 h cookie is replaced before it expires. If it ever lapses the
   screen shows "This display is not authorized", never company data.

## Server configuration (Doppler, prod)

- `OVIE_DISPLAY_SESSION_KEY`: 32+ random bytes. Signs cookies.
- `OVIE_DISPLAY_DEVICES`: JSON, for example
  `[{"id":"air-office","secret":"<32+ random bytes>"}]`. Optional fields:
  `previousSecret` (rotation), `revokedBefore` (number, epoch seconds),
  `disabled` (boolean). Invalid entries are dropped.
  Both unset means the feature is closed.

## Provision (Tim)

1. `openssl rand -base64 48` twice: one device secret, one session key.
2. Put both in Doppler (`OVIE_DISPLAY_DEVICES`, `OVIE_DISPLAY_SESSION_KEY`).
3. On the Air: `security add-generic-password -s ovie-display-air-office -a "$USER" -w "<device secret>"`.

## Revoke (immediate, no redeploy)

Revocation lives in Redis and is checked on every request:

- One device now: `SET ovie-display:disabled:<device> 1`.
- A device's sessions minted before now (re-connect allowed):
  `SET ovie-display:revoked-before:<device> <epoch seconds>`.
- Every display: `SET ovie-display:revoked-before:all <epoch seconds>`.
- Undo: `DEL` the key. A junk (non numeric) value denies.

The env registry also carries `disabled` / `revokedBefore`, but those change
only on a redeploy (Vercel bakes env into a deployment), so use Redis for
anything urgent. Rotating `OVIE_DISPLAY_SESSION_KEY` also signs every display
out, again on the next deploy.

## Rotate the device secret (no downtime)

1. Generate a new secret. Set `secret` = new, `previousSecret` = old.
2. Update the Air keychain (`security add-generic-password -U ...`).
3. Once the Air has minted a session with the new secret, drop `previousSecret`.
   Live sessions survive (they do not depend on the device secret).

## Known limits

- A stolen cookie reads Home data until it expires or is revoked. It cannot write.
- The replay and rate-limit stores are Redis; with Redis down the display is
  denied (fail closed) until it returns.
- `OVIE_DISPLAY_DEVICES` is parsed strictly: an entry with any invalid field
  (for example `"disabled": "true"`) is dropped whole, which removes access.
- `/display/connect` and `/display` are outside `/app`, so no Clerk shell.
