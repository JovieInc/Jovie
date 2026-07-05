# Cloudflare Turnstile Setup

Jovie uses Cloudflare Turnstile to gate anonymous onboarding chat on `/start`
and changelog email signup. Production signup is blocked when the active widget
does not authorize the serving hostname (Cloudflare client error `110200`).

## Required production hostnames

The production widget referenced by `NEXT_PUBLIC_TURNSTILE_SITE_KEY` must allow:

- `jov.ie`
- `www.jov.ie`

Staging shares the same widget today and should also allow:

- `staging.jov.ie`
- `main.jov.ie`

Use `scripts/turnstile-config.ts` as the source of truth for these lists.

## Secrets (Doppler `jovie-web/prd`)

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
CLOUDFLARE_API_TOKEN      # Turnstile Sites Read + Write
CLOUDFLARE_ACCOUNT_ID     # optional when R2_ACCOUNT_ID is already set
```

`CLOUDFLARE_ACCOUNT_ID` matches the Cloudflare account that owns R2
(`R2_ACCOUNT_ID` in Doppler).

## Inspect the active widget

```bash
doppler run --project jovie-web --config prd -- \
  pnpm tsx scripts/turnstile-config.ts show
```

## Add missing hostnames (preferred automation)

Preview:

```bash
doppler run --project jovie-web --config prd -- \
  pnpm tsx scripts/turnstile-config.ts ensure-hostnames --dry-run
```

Apply after review:

```bash
doppler run --project jovie-web --config prd -- \
  pnpm tsx scripts/turnstile-config.ts ensure-hostnames --yes --allow-prod
```

Include staging hostnames in the same widget:

```bash
doppler run --project jovie-web --config prd -- \
  pnpm tsx scripts/turnstile-config.ts ensure-hostnames \
    --target all --yes --allow-prod
```

## Manual dashboard fallback

1. Open Cloudflare → Turnstile → select the widget used by
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
2. Settings → Hostname Management → Add Hostnames.
3. Add `jov.ie` and `www.jov.ie` (and staging hostnames if needed).
4. Re-test `https://jov.ie/start` — the widget must not show
   `Verification failed (110200)` or `Turnstile is not configured`.

## Verification

Production smoke checks:

```bash
# Read-only synthetic golden path (CI)
pnpm --filter=@jovie/web exec playwright test tests/e2e/synthetic-golden-path.spec.ts

# Signup readiness (env only)
doppler run --project jovie-web --config prd -- \
  pnpm --filter=@jovie/web run check:signup-readiness -- --target=prd
```

Healthy `/start` behavior:

- Page returns `200`
- No `turnstile is not configured` copy
- No `Verification failed (110200)` copy
- First anonymous onboarding chat POST reaches the Turnstile gate instead of
  failing client-side

## Creating `CLOUDFLARE_API_TOKEN`

Create a custom token in the Cloudflare dashboard with:

- Permission: **Turnstile Sites Read**
- Permission: **Turnstile Sites Write**
- Account resource: the Jovie account (`fd8a6fcfa0ff0b708dbae942af18c49b`)

Store the token in Doppler `jovie-web/prd` (and `stg` if operators run the
script there). Do not commit token values to Git.

## Related

- `scripts/turnstile-config.ts` — hostname automation
- `apps/web/lib/turnstile/verify.ts` — server-side siteverify helper
- `docs/DOPPLER_SETUP.md` — production signup readiness keys
- `docs/SYNTHETIC_MONITORING.md` — `/start` Turnstile smoke coverage