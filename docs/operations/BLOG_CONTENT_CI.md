# Blog content CI and publish-latency measurement

Tracking key: `BLOG-MD-2026-10-01/content-ci` (`JOV-7398`). This is a
qualification profile inside the existing affected-test selector, CI workflow,
native merge queue, and production controller. It is not a second publishing
system.

## Baseline recorded on 2026-10-01

Before this change, a diff containing only `apps/web/content/blog/*.md` was
`mode: none` in `scripts/run-affected-tests.mjs`. The product classifier still
selected the Web lane, so an admitted merge-group head ran 15 Web unit matrix
entries plus Build + Layout, Ovie build, Ovie typecheck, and Storybook surfaces.
There was no rendered blog candidate gate and no blog-specific end-to-end
latency receipt.

The stable required contexts were and remain `PR Ready`, `Migration Guard`,
`Fork PR Gate`, and `PR Size Guard`; branch protection is unchanged.

The historical strict cohort contains zero qualifying PRs: inspected recent
blog PRs also changed tests, renderers, components, or other source. Therefore
both the representative before and after sample counts are `n=0` in
`docs/metrics/blog-publish-latency-latest.json`. That is the actual baseline;
it is not a latency win or a publishing SLA.

The build dependency remains:

```text
plain Markdown + publication metadata + safe raster assets
  -> shared blog catalog/publication policy
  -> article, listing, category, author, related, feed, sitemap, share
  -> Next.js candidate build
  -> native merge queue
  -> normal production controller and Production Verified
```

Markdown is bundled into the application build. Faster qualification does not
make it independently publishable and does not change queue ordering,
coalescing, deployment, rollback, or post-deploy verification.
The receipt reserves `feed` as an affected output family, but the audited tree
has no dedicated blog feed endpoint today; adding one is a renderer/source
change and therefore takes the full path.

## Selection contract

The entire name-status diff is evaluated by the classifier from the trusted
base revision. Content-only means every record is an add, modify, or delete of:

- one lower-kebab `apps/web/content/blog/<slug>.md` file, including its
  frontmatter metadata; or
- one lower-kebab `.avif`, `.jpg`, `.jpeg`, `.png`, or `.webp` below
  `apps/web/public/images/blog/`.

Renames and copies, MDX, SVG or other executable/unsafe assets, mixed source or
renderer changes, dependencies and lockfiles, workflow/policy/validator edits,
unknown paths, malformed/empty diffs, and unavailable certification proofs all
fall back to normal qualification. Labels and declared intent are not inputs.
The JOV-7396 publication and JOV-7397 factory certification tests must already
exist on the trusted base, so a content author cannot introduce or edit a gate
and enable the narrow profile in the same diff.

The selected job always runs those two proofs, including corpus identities and
article/discovery/share evidence, then performs the real `@jovie/web` Next.js
candidate build. Its receipt names all affected output families. The stable
required context remains `PR Ready`; skipped full Web work is accepted only
when `Blog Content Qualification` succeeds on the exact admitted combined head.
Direct-main fallback remains full qualification.

Existing PR-size limits, native queue admission, exact-head freshness, and the
non-cancelling production FIFO continue to own batching and stale-work
discarding. A blog batch does not gain a size exception.

## Measurement

Each qualification artifact records candidate creation, qualification start
and end, selected checks, retry count, runner seconds, and candidate-build
seconds. The existing daily Shipping SLO collector adds the last queue entry,
merge, first exact production deployment, and exact successful `Production
Verified` timestamp. Missing API evidence remains `null` rather than being
treated as zero or green.

`docs/metrics/blog-publish-latency-latest.json` reports sample counts,
representative samples, and p50/p95 candidate-to-confirmed-live time separately
for legacy and content-only cohorts. It emits no improvement or SLA claim until
both cohorts have complete samples.

**Ship now:** the fail-closed classifier, certification/build profile, stable
aggregate wiring, and measurement scaffold.

**Re-evaluate when:** representative certified content-only samples show where
candidate-to-live time and cost are actually spent, including queue and deploy.

**Then:** use those measurements under JOV-7244 to decide whether decoupled
content delivery is justified. Do not infer that decision from faster CI alone.
