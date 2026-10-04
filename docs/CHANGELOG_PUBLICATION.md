# Customer changelog publication

Owner: Production Controller (transport), source PR writer (approved customer copy and path evidence). CHANGELOG.md is the authority for the public page, date permalinks, JSON/Atom feeds and What's New.
Subscriptions are unchanged; publishing a digest does not send email.

## Source metadata

Put this hidden block in the source PR body. Use a customer outcome, not a PR title or implementation description. Related PRs share an outcome key and identical copy; conflicting copy fails closed.
Internal work uses `<!-- customer-changelog/v1 {"releaseWorthy":false} -->`.
Source Validation requires an explicit decision for customer-code PRs created from 2026-10-03 UTC; older PRs retain their admission contract. Metadata-only repairs require rerunning Source Validation.

`outcomeKey` is the permanent, repository-wide customer-entry identity. It uses lowercase ASCII words separated by hyphens and is never reused for a different update. First publication persists `entryId`, `slug`, and `aliases` in the daily receipt; later copy edits, section moves, and source replays retain those values. Published fragments that predate this receipt shape live in `apps/web/data/customer-changelog-permalink-migrations.json`. Missing or colliding identity evidence fails closed instead of regenerating a fragment from current copy or position.

```html
<!-- customer-changelog/v1 {"issueId":"JOV-7447","outcomeKey":"profile-link-claim","audience":"public","visibility":"public","releaseWorthy":true,"section":"Added","text":"Choose your profile link: Start with a name on the homepage.","availability":{"status":"ga","prerequisites":[]},"evidence":[{"url":"https://jov.ie/","contains":"Claim"}]} -->
```

Sections: Added, Changed, Fixed, Removed. Public copy is at most 400 characters, without internal tooling or issue IDs.
Evidence uses bounded read-only checks on jov.ie or docs.jov.ie. Approve only claims the path actually proves; authenticated actions, payments and entitlements need their actual customer-path receipt, not marketing headlines.
Optional `details` (up to 3 claim-mapped bullets, each at most 240 customer-safe characters) explain what changed and why it matters beyond the one-line outcome.
Optional `action` (`{"label":"…","href":"…"}`, label at most 80 characters) gives the entry one next step. The destination must be an internal path or `https` on jov.ie/docs.jov.ie — a working example, setup, or help route a signed-out visitor can actually open. Unsafe or unverifiable destinations fail validation; omit `action` rather than linking a placeholder or the generic homepage.

## Release path

`node scripts/publish-daily-changelog.mjs --marker <verified-marker.json> --output <temporary-directory>`
produces a reviewable plan and changelog. The successful main Production Verified job, controller run/attempt, fresh public build SHA and deployment ID must match. Every source merge must be an ancestor of that deployment.
The publisher checks public identity again after collection. Superseded generations defer; missing copy, failed paths and conflicting claims cannot publish.

`--write` requires a clean `release/daily-changelog-YYYY-MM-DD-<run>-<attempt>` checkout.
The release PR changes only CHANGELOG.md and follows exact-head source CI, the native queue and Production Controller.
No CalVer, package version, tag, desktop release or alias is mutated. Implementation-branch restrictions remain.
The existing hourly Auto-Merge Default owner finishes only changelog-only drafts with every required check passing at the observed head, then requests native auto-merge. The production publisher is not a second merge owner.

At most three grouped outcomes per UTC date. Later changes append to that post, preserving copy, source/runtime provenance and whole-post dismissal. Overflow remains pending for the next date. Source IDs are persisted in receipts.
No-change/deferral plans are retained as workflow artifacts; validation failures fail the job.
Recovered work is dated when its path is verified, never its merge date. `--seed <file>` accepts reviewed `{number, note}` records for recovery without modifying historical PR bodies.

The customer archive, release detail, hero, and customer-entry feeds use the persisted slug. Alias anchors resolve to the same entry. If a receipted entry is withdrawn from public sections, its fragments resolve to an explicit unpublished tombstone and never to another update. Daily-post dismissal stays keyed to the existing date/version post identity.

## Verification and cost

Scripts CI runs evaluator/publication tests with per-file floors: 85% lines, 75% branches, 82% functions.
Recovery scans at most 5,000 first-parent commits; PR reads batch 50/request; public sources have at most three checks. Normal collection starts at the last published deployment head. No model, service, database, cron or automatic email.
Adopt-first decision, 2026-10-02: extend the existing evaluator, parsers, verified artifact and release transport.
A separate service/store adds an authority without fixing the missing publisher. Ship now: approved copy and verified outcomes. Re-evaluate when PR writers cannot maintain metadata; then assess the existing governed factual-writing model route with measured evaluation proof.

## Customer archive and rollout evidence

The customer index, feeds, and What's New project only exact copy approved by a bound daily publication receipt. Historical engineering records keep their original source, dates, and permanent version pages, linked from the collapsed engineering-history index. Unreviewed technical bullets are not customer cards.

New public source metadata declares `availability: {status: "ga" | "preview" | "limited", prerequisites: string[]}`. Limited rollout requires explicit prerequisites. The publisher retains this declaration and its verified customer-path evidence; it does not infer GA from eligibility. Older receipts without a declaration remain explicitly `unverified`, with no GA claim. Public/internal and scope admission for new customer-code PRs begins October 3 UTC; existing PRs keep their admission rules.
