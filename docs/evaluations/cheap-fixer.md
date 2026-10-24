# Cheap fixer: first rung of the repair ladder

Status: shadow mode first. Kill switch: repo variable CHEAP_FIXER_MODE=off.

## Backend decision (evidence, 2026-10-24)

Chosen: **GitHub Actions job on `workflow_run: completed` (failure) calling the Vercel AI Gateway**, with Jev (also on the Gateway) as judge. One credential, already present as the repo secret `AI_GATEWAY_API_KEY` (set 2026-06-22, used by ci.yml, pr-review.yml, etc.; Jev's contract in docs/evaluations/jev-gateway-integration.md uses the same key).

| Option | Verdict | Evidence |
|---|---|---|
| (a) Cloudflare Worker/Container + Workers AI | Not now | No `CLOUDFLARE_API_TOKEN`/account id in GitHub secrets or vars (`gh secret list`, `gh variable list`); only token use is packages/research (local wrangler OAuth). The only worker with a wrangler.toml is observability-ingest (KV id placeholder). A webhook Worker would need new credentials AND a second deploy path, and buys nothing: the Actions trigger fires within seconds of the red `workflow_run`. Workers AI model ids were not verified because no token exists. One-line action for Tim if wanted later: `wrangler secret`/GitHub secret `CLOUDFLARE_API_TOKEN` (Workers AI + Workers Scripts edit) + `CLOUDFLARE_ACCOUNT_ID`. |
| (b) Actions + AI Gateway | **Chosen** | Key exists. Model ids verified live 2026-10-24 (HTTP 200 with the repo key, both): `zai/glm-5.3-flash` ($0.15 in / $0.50 out per M tokens), fallback `openai/gpt-6-luna` ($0.10 / $0.50). Jev: `typesafe-ai/jev` ($0.042/M in). Repo already runs `zai/glm-5.2` for visual review via the same Gateway (VISUAL_REVIEW_MODEL). A 3k-token fix attempt costs about $0.0006. |
| (c) Codex subscription on a GitHub runner | Not used | Needs a ChatGPT OAuth profile on an ephemeral runner, outside `codex_lane.py` leasing (accounts live on gem under ~/.codex-accounts, lease via flock + codex-accounts.json). Using it from Actions would steal quota from gem workers. The Gateway model list already has the cheap OpenAI models, so no subscription is needed: `openai/gpt-6-luna`, `openai/gpt-6.1-sol` ($2/$10) exist as pay-per-token. If a frontier second rung is ever wanted, route it through `codex_lane.py`, not a second pool. |

"GLM 5.3 flash" is real: `zai/glm-5.3-flash`. "6.0 luna" is `openai/gpt-6-luna`; "6.1 sol" is `openai/gpt-6.1-sol` (not used; luna is cheaper and sufficient).

Interface is one function (`chat(model, prompt)` in scripts/cheap-fixer/cheap-fixer.mjs) so a second backend (Workers AI) can be added behind it later and routed by failure class.

## Discovery (how the ladder works today)

- `.github/workflows/lane-fix-relay.yml`: on `workflow_run` completed (Source Validation, CI, Changed-Evidence Test Suites, ...) it runs `scripts/lanes/pr_events.py relay`, which puts a `lane-fix-red` label on the PR within about 40 s and drops a wake file on gem. A lane worker (`lane_runner.claim_red_pr`) takes the PR. Observed red-to-claim up to 11 minutes when slots are busy (#22868, per lane_runner comments).
- Claim/lease semantics: cross-host claim is a PR comment `🤖 lane claim kind=fix sha=<head> host=<host> at=<iso>` (lane_runner.post_claim). `pr_events.claim_active` treats an unexpired (2 h TTL) claim for the exact head sha and kind by another host as ownership; lanes also hold a local flock `locks/repair-pr-<n>.lock`. Fix attempt lease on gem is 3 h (FIX_LEASE_S); `lane-fix-exhausted` marks PRs the lanes gave up on.
- Holds: HOLD_LABELS = hold, gated, incident, do-not-merge, tim-hold, tim:hold, hold:tim, queue-deferred (pr_events.py).
- Jev: `typesafe-ai/jev`, agent-identities.json status `shadow`, advisory text evaluator through `scripts/invariants/jev-gateway.mjs` (`prepareJevChoiceRequest`, `runPreparedJevEvaluation`), already used shadow-only for CI triage (docs/evaluations/jev-ci-failure-triage.md: 0.8 floor, abstain to the ladder). It cannot certify or merge; here it is a gate that can only say no.
- Credentials: GitHub secrets `AI_GATEWAY_API_KEY`, apps `SYMPHONY_APP_*` (read), `JOVIE_BOT_*` (write), `CI_APP_*`. Doppler is not configured on gem; the Gateway key is reachable on the Mac via `doppler -p jovie-web -c dev`.

## Design

Trigger: `.github/workflows/cheap-fixer.yml`, `workflow_run` completed, conclusion failure, event pull_request, same workflows as the relay minus ones with no code fix. No debounce. Variable `CHEAP_FIXER_MODE`: unset/`shadow` (default), `push`, `off` (kill switch). `CHEAP_FIXER_PUSH_CLASSES`: comma list of classes allowed to push.

Per attempt (scripts/cheap-fixer/cheap-fixer.mjs), exits at the first failed gate and leaves the PR to the lanes:
1. PR open, same repo, base main, `head.sha` equals the failed run's sha (stale heads skipped), no hold label (list above plus needs-human-decision, lane-fix-exhausted, queue-poison).
2. No unexpired lane claim by another host for this head. Push mode: at most one attempt per head (an existing cheap-fixer claim means done).
3. Failing job (aggregators like PR Ready are skipped) log tail, redacted by `curateLogTail`, last 6 KB.
4. Deterministic class from the log: format, lint, typecheck, snapshot, generated, test. `pr_metadata`, `infra`, `unknown` go straight to the lanes with no model call (cost 0).
5. Push mode only: post the lane claim comment (`host=cheap-fixer`), re-read, earliest claim wins, loser deletes its own. Shadow mode never claims, so it cannot slow the lanes.
6. Context: only files the PR changed (or snapshots) that the log names, at the exact head sha, each at most 40 KB.
7. `zai/glm-5.3-flash` proposes JSON search/replace edits (temperature 0, one retry on `openai/gpt-6-luna` only when the reply is unparseable). Each `search` must match exactly once or the attempt fails closed.
8. Deterministic guards: at most 3 files and 60 changed lines; no CI, lockfile, auth, billing, migration, config, canon, lanes or invariants paths; files must be in the PR diff; no hand edits to test files for the `test` class; no net removal of assertions; no added skip/only/todo/ts-ignore/eslint-disable/biome-ignore/`as any`/`|| true`/continue-on-error/retry/exit 0.
9. Jev (`jev-patch-verdict/v1`, choice: approve / reject_incorrect / reject_weakens / reject_scope / insufficient) sees class, log tail and diff. Push only on `approve` at probability 0.8 or higher. Admission is per-attempt, capped at $0.01.
10. Shadow: write the receipt and diff to the job summary and a 30-day artifact, nothing else. Push: re-check head and holds, then create one verified commit through the git data API with the Jovie Bot app (no force, `force=false` on the ref update, never main), `fix(ci): <class> fix from cheap-fixer for #N`, then delete the claim (it is fenced to the old head anyway). Any failure after the claim deletes the claim and the lanes proceed (relay already labelled `lane-fix-red`).
11. Never executes PR code. Logs and file text are untrusted; the prompt says so, and the guards plus Jev are the backstop.

Measurement (receipt `jovie-cheap-fixer-receipt/v1`, uploaded every run): `stages.red` (run updated_at) to `start`, `logs`, `claimed`, `model`, `guards`, `jev`, `pushed` ISO stamps, `durationMs`, per-model token usage and USD, outcome, class, matched signature, failed jobs. Derived: time-to-first-fix = pushed - red; success = new head goes green and is not reverted (join to check suites on `pushedSha`); cost per fixed PR = sum costUsd of runs ending `pushed` plus Jev cost / count; lanes load avoided = fixed PRs whose `lane-fix-red` clears with no lane claim. `scripts/cheap-fixer/report` (follow-up) will join receipts to outcomes.
