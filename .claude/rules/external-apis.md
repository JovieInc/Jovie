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

`node packages/api-client/cli.ts status --json` (or `PYTHONPATH=scripts python3
-m apiclient status --json`) shows per-provider budget, breaker and usage for lanes doctor.

**Enforced:** `node scripts/external-api-guard.mjs` fails CI on a new provider
host, SDK client, `gh` subprocess or workflow `gh` call outside the client
layer. Existing sites are grandfathered in
`scripts/lib/external-api-guard.ratchet.gen.json`, which only shrinks; run
`--write` after removing one. A permanent exception needs an entry with a
reason and a cap in `scripts/lib/external-api-guard.allowlist.json`.
New provider: add it to `providers.json` with its budget headers and a
fake-provider test of 429, secondary-limit and reset behavior.
