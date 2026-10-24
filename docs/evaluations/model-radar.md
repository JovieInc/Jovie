# Model radar and adoption

EVENT (Tim, 2026-10-20): every new model is a chance to rerun loops, but only
where it is better for that task at a controlled cost. Sometimes a new frontier
model rewriting a whole area beats a hundred small issues; that is a campaign,
and it still ships through PRs, CI and the merge queue.

## How it works

| Part | Where |
|---|---|
| Detection (daily) | `scripts/lanes/model_radar.py detect`, a lanes-tick job (`tick()`, same contract as `yc_corpus.tick`) |
| Sources | Vercel AI Gateway `/v1/models`, `wrangler ai models --json`, `ant models list`, `hyperagent models --json`, ElevenLabs `/v1/models` when `ELEVENLABS_API_KEY` is set, plus AI-lab news pages the signal watcher writes to gbrain (`signals/`, tag `ai-lab`) |
| Events | gbrain `models/events/<day>/<source>-<model>` (new, changed, deprecated, removed) and the digest `models/radar/<day>` |
| Task registry | [`ops/models/task-registry.json`](../../ops/models/task-registry.json): task type, current model, channel, cost per run, quality metric, eval set. CI fails when a task's declared model no longer matches its source file |
| Screen | same-family successors of each task's model, Workers AI decision and extraction models, and named candidates. Channel policy runs first: Gateway allowlist (JOV-8109), no metered openai/anthropic (JOV-7119), Summer's budget ceilings |
| Decision | `verdict()`: adopt when success is better beyond noise (two-proportion, z=1.96) at no more than 1.25x cost per success, or equal within noise at 0.8x or less. Reject when worse beyond noise. Otherwise re-evaluate. Cost is **per successful outcome**: retries, repairs and failures count |
| Decision log | `record-decision` writes the `type: decision` page shape of `packages/research` (Ship now / Re-evaluate when / Then) under `decisions/models/`, through `jovie-research decision record` when that CLI is installed. New models fire `jovie-research decision trigger --kind model` |
| Spend | eval and campaign budgets above $25 need Tim's approval (`needs_approval`) |

No routing or provider config changes here. An adoption is a normal PR to the
owning config, a campaign is a Linear epic dispatched through lanes.

## First run (2026-10-20)

Catalogs: Gateway 482 models, Workers AI 73, Anthropic 14, Hyperagent 3,
ElevenLabs skipped (no key). The registry covers 28 AI tasks; 13 candidate
pairings are eligible under current channel policy.

### Adoption table

| Task (current) | Candidate | Evidence | Decision |
|---|---|---|---|
| Summer turns (`zai/glm-5.3-flash`) | Opus 5.5, Sonnet 5.5, Haiku 5.5, DeepSeek V4.1 Flash, Clef cascade | 96-case Summer task eval below | **Keep glm-5.3-flash.** Re-evaluate on a new roster-eligible model or weekly |
| CI failure triage (Jev) | Clairic extract then Clef decide | 39-job replay: 15/25 decided correctly at 0.8 vs Jev 16/25; $0.048 vs $0.0036; 2.3-2.5 s vs 0.55 s | **Reject.** Re-evaluate when the repair prompt needs typed fields (failing file, root error) or Clairic leaves preview |
| CI failure triage (Jev) | Clef (27B) direct | 21/25 decided at 0.8, all correct, 1 unclear tail misrouted; $0.0176 | **Re-evaluate** at 100+ labeled shadow receipts (gain within noise) |
| PR stage-time p95 forecast (code) | Clairic `forecast` | 3 cut-offs x 7 days: MAE 25.2 h vs 13.0 h for the 7-day median | **Reject.** Code does the math, as the Clairic authors advise |
| Remediation route chain (`grok-4.6`) | `grok-4.7` | lanes `providers.json` already runs 4.7; registry still names 4.6 | Route-hygiene campaign |
| Marketing layout chooser, copy judge standard tier (`claude-sonnet-5`) | `claude-sonnet-5-5` | same price, subscription | Route-hygiene campaign, gated on the copy/marketing eval |
| Screenshot bug loop (`claude-haiku-4-5`, `openai/gpt-5-mini`) | Clef screenshot evaluator (#22339) | metered Anthropic/OpenAI conflicts with JOV-7119 | Route-hygiene campaign |
| Clef screenshot evaluator (`clef`) | `clef-omni`, `clef-flash` | not run | Re-evaluate on its labeled set |
| Research router judge (`clef-flash`) | `clef`, `clairic` | no labeled set | Build the set first |
| FX CI repair, PR conflict handler (were `openai/gpt-5.6-*` on a Gateway key) | allowlisted `zai/glm-5.3` | JOV-7119 forbids metered openai | Routed to `zai/glm-5.3` (JOV-8702, #22393) |

### Summer task eval (first fully managed task)

96 frozen real inputs in `JovieInc/summer-config` `apps/summer/evals/model-eval`:
39 CI-failure triage, 17 Linear lane routing, 11 shipping cards, 14 founder
replies, 15 investor-intro prep drafts. Every arm gets Summer's own
`instructions.md`, one repair turn, and is charged for every call. Claude arms
ran on the subscription and are priced at list for comparison.

| Arm | Success (strict) | Spend | Cost per success | Mean latency |
|---|---:|---:|---:|---:|
| `zai/glm-5.3-flash` (current, Gateway) | 68/96 | $0.120 | $0.0018 | 6.9 s |
| `claude-haiku-5-5` | 71/96 | $0.126 | $0.0018 | 9.0 s |
| `claude-opus-5-5` | 71/96 | $5.219 | $0.0735 | 10.7 s |
| DeepSeek V4.1 Flash (Workers AI) | 65/96 | $0.255 | $0.0039 | 6.0 s |
| Clef (classification slices only) | 48/71 | $0.013 | $0.0003 | 0.7 s |

No arm beats the current model beyond noise at an acceptable cost per success.
Opus 5.5 is +3.1 points (noise 12.6; +7.0 vs noise 10.4 excluding triage) at 41x
cost per success. Haiku 5.5 ties at the same cost and is metered Anthropic.
DeepSeek V4.1 Flash is refused by the Gateway allowlist and costs 2.2x on Workers
AI. On the classification slices the Clef cascade is equal within noise (48/71 vs
glm 46/71) at 0.13x cost per success, but Summer has no pre-model classification
step yet. Triage labels follow the CI taxonomy rather than Summer policy, and every
arm fails about half of triage; policy-labeled triage cases are the next eval
improvement. Verdict: keep glm-5.3-flash (decision
`decisions/models/summer-main-model-96-cases-2026-10-20`, superseding the 28-case one).

Summer's model is now a managed choice in summer-config: a roster of models
priced within the budget ceilings, a hash-bucketed canary slice per turn and a
promote/rollback rule on cost per successful turn. A contained trial path for
off-Gateway models (Workers AI on Cloudflare credits first, then the Claude
Platform API credit under a $30/month sub-cap, never the consumer subscription)
ships idle in summer-config#271, with its own ledger and automatic rollback.

## Campaigns (ranked by ROI)

1. **Strengthen tests written in the Devin/Composer era.** About 227 test files
   (~40k lines) under `apps/web/tests/unit` and `apps/web/components/features`
   were added July-October by Devin (swe-2) and Cursor Composer. Pilot one area
   (20 files) with Opus 5.5 on the Claude subscription lane, measured by Stryker
   mutation score. Expected gain: +10 points mutation score on the pilot modules.
   Cost: subscription; API-equivalent about $11 for the pilot, about $125 for all
   (needs Tim above $25 if it ever runs metered). Blast radius: test files only.
   Success: mutation score up, flake rate and CI time not worse than 5%.
2. **Model-route hygiene.** One PR per owner: remediation chain to grok-4.7,
   Sonnet 5 to Sonnet 5.5 in marketing roles and the copy judge, screenshot loop
   off metered Anthropic/OpenAI onto Clef (FX/conflict handler done: glm-5.3). Expected gain: policy compliance and current models. Cost under
   $5 of evals. Blast radius: model ids in config. Success: registry drift check
   green, each owner's eval not worse.
3. **Clef-first System-1 classification.** After 100+ labeled shadow receipts,
   rerun Jev vs Clef on CI triage and the signal classifier; adopt Clef on
   Workers AI credits where it decides more cases at equal precision. Cost under
   $1. Success: decided-at-0.8 coverage up at 95%+ precision.
