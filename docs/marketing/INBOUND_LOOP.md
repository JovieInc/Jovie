# Always-on inbound loop

Status: canonical operating contract

Owner: JOV-7407

Tracking key: LAUNCH-AUDIENCE-2026-10-01/always-on-inbound

Inbound marketing runs as a continuing operating loop: rank real demand and
verified release evidence into a bounded queue of content work, send selected
work through the existing certification and publication path, and learn after
publication. It is not a batch of speculative articles.

This document owns choosing the work. [JOV-7397](BLOG_PUBLISHING.md) owns
article qualification and the Markdown publication contract owns the file
format. The loop never mints certification, never edits the publication
registry, and never creates a second backlog or a per-signal Linear issue.

## Inputs

Two adapter classes feed the loop; each starts with one active adapter and
expands only by changing `scripts/inbound-loop/inbound-registry.json`:

- **Demand signals** (permissioned, provenance-linked): Search Console
  observations under the JOV-4957 event-driven contract, anonymized customer
  questions and objections, failed public-agent tasks, and support patterns.
- **Release evidence** (verified): available features, customer outcomes,
  engineering results, approved OSS releases, third-party coverage, and
  rights-cleared research.

A signal is evidence, never permission to publish and never text to quote.
Private source references (`privateSourceRef`) stay in private storage and are
asserted absent from public artifacts.

## Candidate and decision contract

`scripts/inbound-loop/inbound-loop.mjs` normalizes each input into a content
candidate carrying audience, specific reader job, canonical entity, source and
evidence, expected reader/creator benefit, canonical destination and CTA,
effort, and confidence. Dedup keys are `audience :: readerJob ::
canonicalEntity` — normalized semantics, not keyword spelling — and are checked
against the existing corpus before drafting.

Decisions per candidate: `create`, `update-or-merge`, `distribute-again`,
`refresh`, `defer`, `reject`, or `no-public-action`. The active queue holds at
most `queue.maxActiveCandidates` (initially three); an empty queue is a valid
result when evidence or value is absent. Engineering/OSS events produce an
evidence packet (problem, affected audience, public availability, reproducible
evidence, limitations, tested example, permitted technical detail), not an
automatic article per commit; a content cluster is earned by distinct reader
tasks and one canonical tutorial evolves across releases.

## Reader streams

Streams stay distinct: `customer-problem-solving` (customer problems and
comparisons), `launch-tutorial` (verified launch/tutorial content),
`engineering-oss-research`, and `creator-release-discovery`. Fan-facing pages
primarily help the creator through listening, subscribing, or another relevant
action; developer readership and OSS stars are not artist-customer
conversions. No generic celebrity-biography or startup-pivot sprawl.

## Cadence

Intake is event-driven on verified changes. The durable governor's existing
reconciliation covers missed work, failed deliveries, and freshness deadlines;
the registry authorizes a cheap daily reconciliation and a bounded weekly
editorial reprioritization through existing scheduling primitives. Clock
events never drive discovery and periodic LLM crawls are disabled. Stale or
absent source data disables dependent decisions rather than inventing
activity. Run state persists last successful run, queue age, failure and
recovery, and disable controls via `recordRun`/`reconcileRun`.

## Downstream

Selected work goes through JOV-7396 Markdown validation, JOV-7397
certification, and the existing truth/copy/render/share/SEO checks. Canonical
URLs, source citations, identity disambiguation, real modification dates,
crawlable text, useful internal links, and structured data matching visible
content are preserved. Machine-readable docs/feeds agree with public truth;
there are no guaranteed rankings, citations, mandatory FAQ blocks, or
special-AI-file claims.

Measurement keeps discovery, answer accuracy, and agent actions in separate
funnels with model/version/date and sampling uncertainty recorded. Crawler
requests are not citations, citations are not referrals, and impressions are
not revenue. Each publication connects to permitted distribution, launch
identity, and revision history; primary outcomes are relevant confirmed
subscriptions, product activation, retained/paid value where observable, and
creator benefit. Zero-result and inconclusive outcomes are recorded, not
smoothed over. Content refreshes only when underlying claims, availability,
supported versions, or data materially change — never by bumping dates — and
consolidates or retires by existing policy.

## Launch boundary and approval gates

Routine drafting and quality evaluation are autonomous within existing
permissions. Existing explicit approval gates remain for engineering copy,
sensitive claims, new outbound sends, and publication cohorts. This issue adds
no prerequisite to the first certified article or JOV-7329's bounded revenue
path, and requires no CMS migration, new agent platform, or inventory rewrite.

**Ship now:** deterministic normalization, dedup, bounded queue, event-driven
intake, stale-data disabling, run-state persistence, and the canonical doc.

**Re-evaluate when:** two successive unattended operating cycles (one
demand-led, one release-led) produce observed outcomes, or the active adapter
set needs widening.

**Then:** add adapters and outcome write-back without replacing the bounded
queue, certification path, or event-driven contract.

## Verify

```bash
node --test scripts/inbound-loop/inbound-loop.test.mjs
node scripts/inbound-loop/inbound-loop.mjs
```
