# Golden-path walk recorder

Records a production golden-path walk as a canary and writes the
`scripts/dogfood-judge` run contract, so the vision judge and the buyer-eval
gate read the same recording.

```sh
CRON_SECRET=… DATABASE_URL=… node scripts/golden-path-walk/walk.mjs OUT=… # new visitor: homepage claim -> chat -> sign-up -> waitlist
FLOW=./flow-returning.mjs EMAIL=browse-ready+clerk_test@jov.ie node scripts/golden-path-walk/walk.mjs # sign-in -> app -> profile -> chat -> billing -> pricing
node scripts/dogfood-judge/cli.mjs judge --surface waitlist-signup-to-waitlisted --run <OUT>
```

Canary identities only; the teardown frees shared-pool artists the canary claimed.

## Agents through the /start bot check

Every production agent (cert, demo, QA, walks) uses
`scripts/synthetic-passage-mint.mjs`: `installPassageRoute(page, …)` for
Playwright, or the CLI under `doppler run --project jovie-web --config prd`
for a single token. Never rely on the fail-open path: `/start` admits a
failed Turnstile check on an unverified budget (4 fresh chats per IP per
hour, 120 globally) that exists for real people whose browsers cannot run
the widget.
