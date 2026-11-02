---
paths: ["apps/**", "packages/**", "scripts/**", ".github/**", "workers/**", "tools/**"]
---

# External APIs: One Client, Shared Budgets

Every outbound call to a third-party API (GitHub, Linear, Vercel, Sentry,
model providers, App Store Connect, and every host in
`packages/api-client/providers.json`) goes through the client layer:

| Caller | Use |
|---|---|
| TS / JS | `packages/api-client` (`createGitHubClient`, `createLinearClient`, `createApiClient`, `runGh`) |
| Python | `scripts/apiclient` (`GitHubClient`, `LinearClient`, `ApiClient`, `run_gh`) |
| Shell / workflow | `node packages/api-client/cli.ts gh --priority <p> -- <gh args>` |

The client is the contract. Do not reimplement any of it at a call site:

- **Budget:** one ledger per provider and credential, shared by every process
  on the host (`$LANES_STATE/api-ledger/`), fed by the provider's own
  rate-limit headers. Budget and breaker state are not kept in per-call-site state.
- **Priority:** pass `merge`, `deploy` or `repair` for work that lands or fixes
  something; `default` for normal reads; `report` or `poll` for anything that
  runs on a clock. Polling and reporting are shed first and never starve fixes.
- **Retries:** bounded full-jitter backoff that waits for the provider's reset.
  A rate limit is infrastructure (exit 75, `github-quota-deferred`), never a
  red verdict on a change.
- **Breaker:** repeated 429, secondary limits or 5xx open the per-credential
  breaker; a half-open probe closes it. Transitions log one JSON line.
- **Cache and batch:** GitHub GETs reuse ETags (a 304 is free); repeated reads
  take `cacheTtlMs`; N lookups use one aliased GraphQL `batch()`, not N calls.
- **Money:** a paid call passes `priceUsd` (or the provider's
  `pricing.perCallUsd`). It is reserved against a per-credential UTC-day cap
  (`pricing.dailyCapUsd` or `dailySpendCapUsd`) before the call and refunded if
  the call fails. A priced call with no cap, a reached cap, or a provider 402
  throws `BudgetExhaustedError` (`budget_exhausted`).
- **Credentials:** `resolveCredential` / `resolve_credential` try own, then
  shared, then pooled (opt-in). Every fallback is logged; none means fail closed.
- **Blocked providers** (`"status": "blocked"`, e.g. composio) stay registered
  so the guard flags their hosts; the client refuses to call them.

Limits and headroom are a planning input: [rate-limits](rate-limits.md) (registry
`ops/registry/rate-limits.json`, `node scripts/rate-limit-headroom.mjs`); a new
consumer declares its calls/hour per limit, enforced by the guard below.

`node packages/api-client/cli.ts status --json` (or `PYTHONPATH=scripts python3
-m apiclient status --json`) shows per-provider budget, breaker and usage for lanes doctor.

**Enforced:** `node scripts/external-api-guard.mjs` fails CI on a new provider
host, SDK client, `gh` subprocess or workflow `gh` call outside the client
layer. Existing sites are grandfathered in
`scripts/lib/external-api-guard.ratchet.gen.json`, which only shrinks; run
`--write` after removing one. A permanent exception needs an entry with a
reason and a cap in `scripts/lib/external-api-guard.allowlist.json`.
New provider: register it in `providers.json` (the one registry both languages
and the guard read; no per-consumer hooks) with its budget headers, then run
`--onboard` to grandfather calls to it that already exist.

## GitHub Actions `GITHUB_TOKEN` budget

`GITHUB_TOKEN` gets a fixed hourly REST budget per repo, shared by every
workflow (Team plan; the 05:22Z sample shows limit=5000). On 2026-10-25 demand was 5-7x that and Fleet Rules
Evidence / PR Ready deferred every hour with `API rate limit exceeded for
installation`. The two biggest leaks were `actions/setup-node` (one manifest
call per run, 10 per Source Validation run, because `.nvmrc`'s exact Node is
not on the hosted image) and per-PR-event evidence reads.

- Put `uses: ./.github/actions/prime-node-toolcache` before every hosted
  `actions/setup-node` (the `setup-node-pnpm` composite already does).
- Prefer the CI App token (its own bucket) for read-only calls where the
  workflow's security contract allows it; never hand the minted token to
  setup-node (`scripts/pr-fleet-rules.test.mjs`).
- `node scripts/workflow-token-budget-guard.mjs` (run by PR Fleet Rules) fails
  on a new unbudgeted `github.token` spend. Grandfathered sites live in
  `scripts/lib/workflow-token-budget.ratchet.json` and only shrink (`--write`).
  A workflow that must spend it declares
  `# github-token-budget: <N> calls/run - <reason>`.
- PR Fleet Rules (the `pull_request` copy, which can never hold the App key) runs
  `pr-fleet-rules.mjs --advisory`: PR from the event payload (files are its only
  call, was two), backoff up to 120s, and a quota answer that outlasts it is an
  "Infrastructure, not a verdict" warning (`github-quota-deferred`), never red.
  Fleet Rules Evidence (CI App budget) stays the authoritative verdict. Quota
  share: `node scripts/quota-deferred-heads.mjs --share 40`.
- Headroom, from the `api-quota` notices Merge Queue Green Enroll emits about
  once a minute: `node scripts/lib/api-quota-report.mjs headroom --hours 1`
  (hourly min remaining per bucket, exhausted samples, JSON with `--json`).
