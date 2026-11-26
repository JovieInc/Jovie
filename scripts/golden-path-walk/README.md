# Golden-path walk recorder

Records a production golden-path walk as a canary and writes the
`scripts/dogfood-judge` run contract, so the vision judge and the buyer-eval
gate read the same recording.

```sh
CRON_SECRET=… DATABASE_URL=… OUT=… node scripts/golden-path-walk/walk.mjs # new visitor: homepage -> /start chat -> artist and handle -> email OTP -> live profile
FLOW=./flow-returning.mjs EMAIL=browse-ready+clerk_test@jov.ie node scripts/golden-path-walk/walk.mjs # sign-in -> app -> profile -> chat -> billing -> pricing
FLOW=./flow-latency.mjs EMAIL=browse-ready+clerk_test@jov.ie node scripts/golden-path-walk/walk.mjs # 6 chat turns: ms to first visible answer -> latency.json
node scripts/golden-path-walk/latency-gate.mjs <OUT>/latency.json ~/.local/state/jovie-golden-path-cert/chat-latency-history.jsonl # p95 <= 2s; report-only until 3 passes
node scripts/dogfood-judge/cli.mjs judge --surface claim-signup-to-live-profile --run <OUT>
```

Run the judge example from the judge host. The walk uses canary identities
only and releases shared-pool artist bindings for that run's email.

| Certification stage | Evidence |
| --- | --- |
| Homepage | `homepage` records the entry and the hero's Claim your profile link. |
| Claim | `claim chat` records `/start`. `signup otp step` and `signed in and onboarding claimed` record the email-code handoff. A waitlist visit or receipt fails the run. |
| Artist | `artist catalog preview` records the selected artist and a populated catalog. The claim must keep the handle selected in `handle confirmed`. |
| Profile-live | `profile live` verifies the claimed handle, artist heading, and a release link on the public profile. `receiptMs` measures from the email-code request to first value. Release smartlink navigation and AI response checks also run in `prod-cert-start-chat.spec.ts` and `smoke-prod-auth.spec.ts`. |
| Checkout | `apps/web/tests/e2e/canary-claim-checkout.spec.ts` covers checkout and entitlement with Stripe test mode. |

A fresh claim that still needs operator proof fails the walk. The live-profile
step also requires the canary to be eligible for direct public URL visibility
under the test-profile policy.

## Agents through the /start bot check

Every production agent (cert, demo, QA, walks) uses
`scripts/synthetic-passage-mint.mjs`: `installPassageRoute(page, …)` for
Playwright, or the CLI under `doppler run --project jovie-web --config prd`
for a single token. Never rely on the fail-open path: `/start` admits a
failed Turnstile check on an unverified budget (4 fresh chats per IP per
hour, 120 globally) that exists for real people whose browsers cannot run
the widget.
