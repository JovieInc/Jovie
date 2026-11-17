# Review bar

Applies to every reviewer of a Jovie pull request: Codex code review,
CodeRabbit, Sentry Seer, and any agent asked to review.

## Report a finding only when all three hold

1. **It blocks a release (P0 or P1).** Data loss or corruption, wrong auth,
   billing or entitlements, a security hole, a crash or dead end on the Golden
   Path, or a regression a customer would hit.
2. **It can happen in practice.** Name the input or state the app accepts that
   triggers it: the route, form field, API payload or database row. Inputs that
   validation, types or the schema already reject are out of scope.
3. **It carries evidence.** Repro steps or a failing test, expected versus
   actual, and the file and line.

## Don't report

Style, naming, refactors, missing tests on their own, P2 and P3 nits, and
"could be null" or "could race" without a reachable path. If they matter, put
them in one summary comment, not in review threads.

## For the writer

A P0 or P1 finding with evidence is yours: fix it, or reply with the guard that
makes it unreachable, then resolve the thread. A finding without evidence may be
resolved without a fix; reply "no repro" so the reason is on record.

This bar does not change merge on green (see [PR flow](PR_FLOW.md)).
