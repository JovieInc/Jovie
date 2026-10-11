# Production waitlist canary mailbox (JOV-2332)

This Worker receives only the retained waitlist canary's verification mail. It
stores a six-digit code and two timestamps for five minutes in a dedicated KV
namespace. It does not forward mail, persist MIME bodies, log credentials, or
access Jovie's database. The application remains the OTP validation authority.

`POST /latest` requires `Authorization: Bearer <OTP_CHECK_TOKEN>` and JSON
`{ "email": "<exact CANARY_EMAIL>", "sinceMs": <run start milliseconds> }`.
Responses are `200` with `{otp, receivedAtMs, issuedAtMs}`, `404` while no fresh
code exists, and `503` for configuration/storage failures. All are `no-store`.
Wrong addresses and unauthorized callers cannot read KV. The handler also checks
the mail's Date, so an old message arriving late cannot satisfy a new run.

Sender acceptance also requires exactly one `Authentication-Results` header
from `mx.cloudflare.net`, with `dmarc=pass` and an exact `header.from` domain
match. Missing, duplicated, failed, foreign, or ambiguous results are rejected.
Neither the MIME From nor the SMTP envelope sender is authentication on its own.
This deliberately narrow parser relies on Cloudflare adding its receiving-MX
result; live acceptance must verify that boundary with a legitimate Jovie email
and a spoofed email carrying a forged pass header. Until both receipts exist,
the mailbox is not commissioned. Do not relax the check to make a test pass.

## Adopt-first decision — September 29, 2026

**Compose** the already-approved Cloudflare Email Routing + Worker + KV stack.
Use `postal-mime` 2.7.6 (MIT-0, already present in the repository lockfile), the
parser recommended by Cloudflare, rather than implement MIME parsing. The only
custom code is the retained-address allowlist, bounded parsing, expiring state,
and existing synthetic test's authenticated polling contract. No new scheduler
or general inbox platform is needed. Gmail OAuth is superseded by the canonical
canary contract and would reintroduce mailbox-wide credentials.

Cloudflare owns receiving, execution and KV. Secrets stay in Worker secret
bindings/Doppler; only a dedicated canary address is routed here. The HTTP/JSON
contract and MIME parser are portable; replacing KV needs only its get/put
adapter. Revisit storage if measured delivery exceeds the canary's 90-second
poll window: KV is eventually consistent, and a successful local test is not
proof of propagation time or deployed behavior.

Sources:
- [Email Worker API and recommended parser](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/)
- [Subdomain routing](https://developers.cloudflare.com/email-service/configuration/subdomains/)
- [Cloudflare incoming authentication and DMARC enforcement](https://developers.cloudflare.com/email-service/reference/postmaster/)
- [PostalMime source and license](https://github.com/postalsys/postal-mime)

## Provisioning and acceptance

1. Reserve `canary.jov.ie` only after checking its current DNS. Preserve all
   production MX/TXT and existing Workers. Do not complete an apex-domain
   onboarding wizard if it proposes replacing production mail records.
2. Create a dedicated `jovie-canary-otp` Worker and dedicated KV namespace.
   Copy `wrangler.example.toml` to a local ignored configuration and fill the
   real namespace ID and workers.dev origin. Confirm `CANARY_FROM` matches the
   deployed Jovie auth sender. Add `OTP_CHECK_TOKEN` as a secret binding, a
   random base64url value of at least 32 characters.
3. Configure the **literal** address
   `signup+jovie-prod-waitlist-canary@canary.jov.ie` to invoke this Worker.
   Cloudflare subdomains do not support catch-all rules. Do not route other
   addresses or production user mail.
4. Set Doppler `jovie-web/prd` values from actual deployed resources:
   `E2E_PROD_SIGNUP_EMAIL_BASE=signup@canary.jov.ie`,
   `E2E_PROD_MAILBOX_PROVIDER=cloudflare-email-routing`,
   `E2E_PROD_OTP_CHECK_ORIGIN`, `E2E_PROD_OTP_CHECK_URL=<origin>/latest`,
   `E2E_PROD_OTP_CHECK_TOKEN`, and a distinct
   `PRODUCTION_WAITLIST_CANARY_READ_TOKEN`.
5. Configure the matching signup base and receipt read token on Vercel production
   through the existing release process. Verify deployed preflight identity.
6. Run the existing production-waitlist synthetic and retain its authenticated
   waitlist/audit/analytics/session/identity/zero-email-job receipt. Preserve the
   canary identity. Never supply `DATABASE_URL` or delete a production account.
   JOV-6813 still requires a passing scheduled run for closure.

The Doppler GitHub sync's 100-secret cap (JOV-7237) currently blocks adding these
values. Source, tests and a Worker deployment do not clear that constraint or
prove a working canary. No credentials or real namespace IDs belong in Git.

## Checks and cost

`pnpm --filter @jovie/canary-otp typecheck` and
`pnpm --filter @jovie/canary-otp test` run in the existing CI web lane. The test
command enforces coverage of the actual handler and exercises MIME decoding,
authorization, address isolation, stale/oversized mail, and storage failures.

At four scheduled runs/day, normal use is about 120 email writes/month and at
most 5,400 reads/month at 45 polls/run, plus explicit diagnostic runs. Invalid
HTTP credentials incur no KV reads. There is no outbound email or additional
scheduled job. Verify account quotas before activation; do not upgrade a plan
or broaden routing to accommodate this canary.
