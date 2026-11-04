---
paths: ["apps/**", "packages/**", "scripts/**", ".github/**", "workers/**", "tools/**"]
---

# Rate Limits Are a Planning Input

Plan against the limits before writing the workflow, controller or agent loop,
not after the 429. `ops/registry/rate-limits.json` is the one registry: every
limit (GitHub user token, App tokens, `GITHUB_TOKEN`, GraphQL, search and
secondary; Linear; Vercel; Sentry; AI Gateway; Cloudflare; Neon; gbrain;
Hyperagent), its basis (measured, documented, unmeasured) and its consumers.

- **Headroom now:** `node scripts/rate-limit-headroom.mjs` (`--json`). The same
  data, refreshed on Gem, is `$LANES_STATE/api-ledger/headroom.json` (default
  `~/.local/state/jovie-lanes/`) for Summer and Ovie. Pick the bucket with
  room: the App token is its own bucket, so read-only fleet traffic goes there.
- **Declare:** a new scheduled workflow, controller, lanes script or agent loop
  that calls a provider carries `api-budget: <limit-id> <N>/hr - <reason>` in
  the file (one line per limit it spends), and the PR description states the
  same calls/hour per limit. Size it: N = frequency x calls per run, at the
  priority you pass the client (`poll`/`report` are shed first).
- **Enforced:** `node scripts/external-api-guard.mjs` fails a PR that adds such
  a file without the line, or names an unknown limit id. Existing consumers are
  not retrofitted; add the line when you touch one.
- **Do not:** add per-call-site breakers, sleeps or counters for a limit. The
  client layer owns pacing and breakers ([external-apis](external-apis.md));
  the registry owns the numbers. A new provider or limit goes into both
  `packages/api-client/providers.json` and the registry. Unmeasured limits are
  gaps to close (route the calls through the client so the ledger learns them).

## Quota repair record (2026-11-02)

- Fingerprints: `hold-contract:ambiguous-write-replay` and `hold-contract:incomplete-comment-evidence`.
- Root cause: a lost POST response or deferred DELETE can leave a successful release comment behind; generic retries or the next sweep can duplicate it. Reading only the latest 100 comments can also omit a valid hold receipt.
- Fix pattern: use the shared adapter with retries for reads and one attempt for ambiguous non-idempotent writes. Reconcile the existing comment against the current label application. Judge a release only when the comment connection is complete for the receipt window; otherwise keep the hold as incomplete evidence. Report unfinished work as pending, without claiming earlier mutations did not happen.
- Successful rung and models: Codex subscription, builder `gpt-6.1-sol`, independent judge `gpt-6-luna`. This is source qualification, not a live quota recovery or cheap-fixer pilot.
- Cost and time: provider cost unmeasured; the final 28-test command completed in 7.97 seconds. End-to-end repair and queue time are separate measurements.
- Guard added: `scripts/hold-contract.test.mjs`, registered in the existing CI script-contract selector, exercises process-boundary quota deferral, ambiguous writes, subsequent reconciliation and incomplete receipt windows. Local result: 28 pass, 100% line coverage; hosted exact-head checks remain required.
- Evidence: PR #23764. Retrieve these fingerprints before repeating the repair; preserve the real failure and exit-75 distinction and the existing hold rules.
