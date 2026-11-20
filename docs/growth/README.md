# Growth spine

Registry: `canon/growth-loops.jsonl`. Ledger: `canon/growth-experiments.jsonl`.
Validator and report math: `scripts/lib/growth-registry.mjs`. CI lane: `growth-registry`.

## Add a channel

1. Add one line to `canon/growth-loops.jsonl` (status `draft`).
2. Build links with `trackedLink(loop, url)`. It sets `utm_source`, `utm_medium`
   and `utm_campaign=<loop id>`. The existing first-touch capture stores them on the
   acquisition journey; the funnel report groups journeys by loop id.
3. Outbound contact or spend: the entry needs `approval: {by: "tim", at}` before
   `pilot` or `live`. CI enforces it.
4. Run an experiment: append a line to `canon/growth-experiments.jsonl`.

Dead-man: an active loop with no event inside `expectedEventWindowHours` alerts.

## claim-link-outreach
Qualified lead, claim link minted, Tim-approved DM. Guardrail: opt-out or complaint rate.

## via-jovie-footer
Profile footer and email signature links carry `utm_campaign=via-jovie-footer`.

## jovie-spotted-drafts
Drafts land in Ovie, Tim approves, then posts. No automated replies, mentions or DMs.

## ig-scene-gating
Private local or scene Instagram accounts (per city or genre). Artists request to follow;
a request is the demand signal. Each account opens publicly on its launch day.

Capture (Instagram has no API for follow requests): an operator or Lola reads the pending
requests list, and for each handle creates a waitlist entry with `source = ig_scene`,
`heardAbout = "<scene account>"` and a journey touch `utm_source=ig_scene&utm_campaign=ig-scene-gating&utm_content=<scene id>`.
Approving the follow request is the invite; the entry is the receipt. No outbound message is
sent by the system; Tim approves each scene account and its launch day.

## seo-gsc-pages / artist-referral
Existing loops registered for attribution and dead-man coverage.
