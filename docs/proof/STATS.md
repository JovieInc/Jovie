# Proof stats

Every number Jovie states publicly is a **proof stat**: defined once, measured
by a machine, shown only while it is true and current. This page is the
engineering methodology. The public methodology page (`/proof/methodology`)
renders the same registry.

## Where things live

| What | Owner |
|---|---|
| Definitions (template, rounding, threshold, freshness SLA, fallback, methodology, legal class, visibility, status) | `apps/web/data/proof-stats/registry.json` |
| Typed registry and validation | `apps/web/lib/proof-stats/registry.ts` |
| Rounding, freshness, publishability, `{stat:<id>}` binding | `apps/web/lib/proof-stats/format.ts` (pure) |
| Measured values and events | content record `proof-stats/observations` (versioned, audited, rollback) |
| Production measurement | `apps/web/lib/proof-stats/queries.server.ts`, hourly from `/api/cron/frequent` |
| Producer intake and Summer feed | `/api/internal/proof-stats` (GET feed, POST observations) |
| Copy guard | `scripts/invariants/stat-claims/check.mjs` (ratchet `baseline.json`) |

## Rules a stat must pass to render

`resolveProofStat` returns `publishable` only when all hold; otherwise the
surface hides the stat or shows the registry `fallback`:

1. **Public:** `visibility: public` for public surfaces. Internal stats (most
   engineering and security detail) never render there.
2. **Live:** `status: live`. `proposed` and `measuring` stats are tracked, not shown.
3. **Measured:** an observation exists.
4. **Fresh:** measured within `freshnessSlaHours`. A future timestamp is not fresh.
5. **Over threshold / under ceiling:** counts display from `threshold`;
   lower-is-better stats (latency, open critical vulnerabilities) only under `ceiling`.
6. **Approved:** `comparative` and `health` claims carry a founder-approved
   Summer card (`status: approved`, `resolution: founder`), verified at intake.
   A new value needs a new approval.

Rounding never overstates: counts floor (`floor`, 1 significant digit:
12,345 becomes "10k+"), lower-is-better values ceil ("under 70 ms"). The "+"
appears only when the rounded figure is below the true value.

## Counting rules (production)

All counts exclude internal, test, synthetic and canary accounts through
`lib/accounts/internal-account.ts` (`externalAccountSql`,
`notInternalProfileSql`), which applies the `isInternalOrTestAccountEmail`
rules, the synthetic-principal tags (`lib/synthetic/principals.ts`) and
`users.account_class`.

- `accounts_total`: non-deleted external users.
- `artists_claimed`: claimed creator profiles not owned by an internal account,
  excluding reserved identity handles. Unclaimed ingested profiles never count.
- `smart_links_total`: distinct `(creator_profile_id, smart_link_slug)` in
  `smart_link_targets` for non-internal profiles.
- `release_alerts_delivered`: `fan_release_notifications` with status `sent`
  for non-internal profiles.

## Benchmarks

Speed and agent-readiness stats come from the weekly Public Profile Benchmark
(`scripts/public-benchmark`, methodology `docs/benchmarks/public-profile-benchmark.md`):
public pages only, robots.txt honored, Lighthouse mobile profile, N runs and
the median, hosted runner. Competitors stay anonymized in the repo. A
comparative stat names its benchmark claim (`source.claim`) and stays hidden
until the founder approves it. Where Jovie is slower, the loop files a
ratchet issue instead of hiding the loss.

## Keeping claims true

- The hourly refresh re-measures production stats and re-evaluates every
  stat's state. When a stat stops being publishable (stale, below threshold)
  it writes a version with a `withdrawn` event, which expires the cache tag so
  cached pages re-render without the number.
- Copy binds `{stat:<id>}` (value) or `{stat:<id>.sentence}`. A line with any
  unpublishable binding is withheld whole; a sentence with a hole is a false claim.
- `stat-claims` fails CI on a new hand-written numeric claim in marketing
  copy and on a binding to an unregistered stat.

## Milestones

Stats with `milestones: true` emit a `milestone` event when a value crosses
1, 10, 100, 1k, 10k, 100k or 1M. Bound copy updates on its own (the binding
re-renders); Summer reads the events from `/api/internal/proof-stats` and
sends the win text to Tim, deduping on the event id.

## Adding a stat

1. Add the definition to `registry.json` with `status: proposed` and an
   honest `marketing.value` / `feasibility`.
2. Add a producer: a production query in `queries.server.ts`, or a producer
   that posts to `/api/internal/proof-stats` with a receipt.
3. Move to `live` once it measures. It publishes itself when it passes the rules above.

## The Summer loop

`node scripts/remediation-sweep.mjs --mode proof` runs daily in the Remediation
Sweep (`scripts/lib/proof-loop.mjs`); every stage records start and end times
in the `proof-loop-run` artifact.

| Stage | What it does |
|---|---|
| ideate | Ranks every stat by `marketing.value x feasibility` (seeded with production, benchmark, agent-score, security and engineering stats) |
| establish | One Linear issue per `proposed` stat with no measurement (`proof-stat-establish-<id>`) |
| ratchet | One issue per benchmark loss or missed web-vitals target from the latest run's `proof-ratchets.json` (`proof-stat-ratchet-<metric>-<platform or target>`) |
| publish | A Summer approval card payload (`kind: decision`, `defaultDecision: none`) for every comparative claim that is fresh and true but unapproved |
| keep true | One issue per live public stat that went stale (`proof-stat-stale-<id>`); win texts for milestone events since the last pass |

Run-record metrics: stats published, stale, below threshold, unapproved,
numeric marketing claims and their stat-bound share
(`node scripts/invariants/stat-claims/check.mjs --json`), plans filed,
approval requests and win texts. Summer reads the approvals and win texts from
the artifact or directly from `/api/internal/proof-stats` (events), files the
cards through its own Summer-cards path and texts Tim the wins.
