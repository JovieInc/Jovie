# Metric Providers, Adapters, Cron Admission & Privacy Boundaries

Status: **Draft (research lane)** · Owner: Gem · Updated 2026-08-10

## 1. Metric providers (data sources)

| Provider | Source of truth | Example series |
|----------|-----------------|----------------|
| GitHub | merged PRs (author, headRefName, mergedAt, mergeCommit) | `throughput.prs_merged_pacific_today`, `throughput.prs_merged_daily_7d` |
| Linear | issues, project, labels, state | `throughput.mq_entries`, `throughput.prs_open` |
| Neon / Postgres | product tables (users, activations) | `activation.new_users_pacific_today`, `activation.activated_pacific_today` |
| PostHog | product analytics | `activation.signup_conversion_7d`, funnel metrics |
| Merge queue GraphQL | `repository.mergeQueue.entries` | `throughput.mq_entries`, queue position/state |
| Product adapter (Zoe) | Apollo/merchant source (image/title/price/merchant/url) | `zoe.product.*` |

**Lane attribution (shipping):** separate the **system-of-record merge metric**
from **agent attribution**. Count real merges only from GitHub PR records; a
workflow run, label, branch prefix, or comment is not a merge. Attribute to Gem
only with local receipts (see `jovie-shipper-ops`); never turn aggregate merge
rate into Gem throughput. This separation is a first-class field in the shipping
series (`provenance` must state the attribution basis).

## 2. Metric adapters

Each adapter implements the same interface and emits a `MetricSeries` per the
`live-data-contract.md`:

```ts
interface MetricAdapter {
  readonly metricId: string;
  readonly provider: string;
  fetch(ctx: { nowUtc: string; window: DataWindow }): Promise<MetricSeries>;
}
```

- Adapters are **read-only**; they never mutate sources.
- Adapters normalize into the contract (window, asOf, fetchedAt, confidence,
  sourceUrl, provenance) — they do not return raw shapes.
- Register adapters in a registry keyed by `metricId` (mirror the card registry).
- **Work backwards:** the card contract declares which `metricId`s it needs;
  adapters are written to satisfy those refs, not the other way around.

### Shipping series rules (merge cards)

- Count merges in `[Pacific midnight today, now]` (not rolling 24h).
- Use `gh pr list --state merged --json number,mergedAt,author,headRefName,mergeCommit`
  with weekly UTC windows for 7-day buckets (the GitHub search API caps at 1000;
  see `jovie-shipper-ops` → `shipping-velocity-chart`).
- Attribute Gem vs Codex vs manual by branch/lane receipts; never collapse.

## 3. Cron admission (from the card contract)

**Guardrail:** no new high-frequency cron. Ride existing schedulers
(`docs/CRON_REGISTRY.md`, AGENTS.md scheduling guardrails). Hierarchy:
webhook/event → inline-after-action → on-demand/lazy → add-to-existing-job →
new scheduled job (only with approval + justification).

- **Cards are rendered on demand** (when Tim asks) or at a **bounded cadence on
  an existing scheduler** (e.g. the daily digest / heartbeat / pipeline-scoreboard
  job). They are not a new cron family.
- A card render may be wired into an **existing** job that already fetches the
  same providers (e.g. the shipping/pipeline-scoreboard job), so it does not add
  new API volume.
- **API volume budget:** `(calls/run) × (runs/day) × 30 = monthly calls`. A card
  that fans out to GitHub/PostHog/Neon on every render must be attached to a
  low-cadence or on-demand path, not a per-minute cron.
- **No O(users) fan-out.** Personal product cards are per-user on-demand; they
  never iterate all users on a schedule.
- **Card render admission flow:** a scheduler invokes a card's `render`; the
  renderer checks the `CardContract.targets`, resolves `MetricRef`s via adapters,
  applies the no-default guard, renders, delivers per channel rules, writes a
  receipt. If a metric is unavailable, the card fails closed (short human text on
  personal channels), never stale.

## 4. Privacy boundaries

Cards fall into two privacy classes; they must not cross.

### Class JS (Jovie ops / internal)

- `acme.shipping.*`, `acme.user_growth.*`, dashboard/status cards.
- **Internal-only** by default. Contains company throughput, queue, merge, and
  growth data.
- Rendered to internal surfaces (console, ops dashboards, Tim's iMessage when
  asked, Telegram backup). Never public.

### Class ZO (personal / Zoe product cards)

- `zoe.product.recommendation` and any personal product data.
- **Personal, per-user.** Contains product image/title/price/merchant/URL sourced
  from the product adapter.
- **Privacy requirements:**
  - Never included in any Jovie ops aggregate or public surface.
  - Only delivered to the user's own channel; never shared, broadcast, or logged
    into a public artifact.
  - Render gracefully (placeholder, no leak) if the product image fails
    (`toDataUrl` failure → placeholder, no external URL leak of the failure).
  - No LLM call; deterministic render of adapter data only (no model sees the
    personal product data to "write" it).
- **Zoe owns personal tasks**; Jovie ops metrics are Summer/Gem's concern. The
  renderer is shared, but data ownership and recipients are separate.

### Boundary enforcement

- The card registry tags each card with a privacy class (`classification:
  'ops-internal' | 'personal'`).
- Delivery targets are filtered by class: personal cards only to the owner's
  channel; ops cards only to internal surfaces.
- A unit test asserts no personal card can be routed to a public/internal-aggregate
  target and no ops card reads personal product data.

## 5. Verifiability

- Every provider read is a **read-only** query; record the exact command/query
  used and mark any proposed-but-not-run SQL as such (per
  `implementation-packet-recon`).
- Freshness, authority, and coverage gaps are explicit: a metric that is
  configured but not fetched = `unknown`, never `0`/healthy.
- Adapters and adapters status are observable so a card's `sourceKey` maps to a
  real, checkable adapter state.