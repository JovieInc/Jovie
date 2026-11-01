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
