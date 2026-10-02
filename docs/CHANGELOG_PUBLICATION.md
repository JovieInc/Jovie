# Customer changelog publication

Owner: Production Controller (transport), source PR writer (approved customer
copy and customer-path evidence). CHANGELOG.md is the public authority. Public
page, permanent date pages, JSON/Atom feeds and What's New consume its parser.
Subscriptions are unchanged; publishing a digest does not send email.

## Source metadata

Put this hidden block in the source PR body. Copy is a customer outcome, not a
PR title or implementation description. Related PRs share an outcome key and
identical approved copy; conflicting copy fails closed. Internal changes use
`<!-- customer-changelog/v1 {"releaseWorthy":false} -->`.
Source Validation requires an explicit decision for customer-code PRs created
from 2026-10-03 UTC; older PRs retain their existing admission contract.

```html
<!-- customer-changelog/v1 {"issueId":"JOV-7447","outcomeKey":"profile-link-claim","audience":"public","visibility":"public","releaseWorthy":true,"section":"Added","text":"Choose your profile link: Start with a name on the homepage.","evidence":[{"url":"https://jov.ie/","contains":"Claim"}]} -->
```

Sections are Added, Changed, Fixed or Removed. Public copy is at most 400
characters and excludes internal tooling and issue IDs. Evidence is a bounded
read-only check on jov.ie or docs.jov.ie. A page substring is suitable only for
a claim that the page proves; authenticated actions, payments and entitled
features need their actual customer-path receipt before public copy is approved.
Do not use a marketing headline as proof that an action works.

## Release path

`node scripts/publish-daily-changelog.mjs --marker <verified-marker.json>
--output <temporary-directory>` produces a reviewable plan and changelog. The
marker must belong to a successful Production Verified job on main and match
the fresh public build SHA and deployment ID. Every source merge must be an
ancestor of that deployment. Superseded-before-availability generations,
missing metadata, failed paths and conflicting claims cannot publish.

`--write` requires a clean `release/daily-changelog-YYYY-MM-DD` checkout. The
release PR changes only CHANGELOG.md, follows exact-head source CI and the
native merge queue, and deploys through the ordinary Production Controller.
No CalVer, package version, tag, desktop release or alias is mutated by the
publisher. Implementation branch restrictions stay in force.

At most three grouped customer outcomes are published per UTC date. A
published date is immutable; later sources remain pending for the next date.
Source IDs are persisted in hidden receipts, overflow is carried forward, and
no-change/deferral/failure plans are retained as workflow artifacts. Older
recovered work is dated when its customer path is verified, never its merge
date. `--seed <file>` accepts a reviewed array of `{number, note}` records for
recovery without modifying historical PR bodies.

## Verification and cost

The scripts CI lane executes the evaluator and publication tests with per-file
coverage floors of 85% lines, 75% branches and 82% functions. Recovery scans at
most 5,000 first-parent commits, reads PRs in batches of 50 and performs at most
three public checks per explicitly public source. Normal runs begin at the last
published deployment head. There is no model invocation, new service, database,
cron, subscriber iteration or automatic email.

Adopt-first decision, 2026-10-02: extend the existing daily evaluator, parsers,
Production Verified artifact and release branch transport. A separate release
service or store adds an authority without fixing the missing publisher. Ship
now: exact approved copy and verified customer outcomes. Re-evaluate when
approved source metadata cannot be maintained by PR writers; then assess the
existing governed factual-writing model route using measured evaluation proof.
