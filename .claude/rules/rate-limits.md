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
