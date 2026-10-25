# System-1 router and tuning loop

System-1 models (Jev, Clef, Clef-flash) answer narrow questions with typed
probabilities in under a second for a fraction of a cent. This is the one way
to call them from the fleet. It sits on `packages/api-client` (Cloudflare and
AI Gateway providers: shared budget, breaker, retries); it never opens its own
socket. Capacity-registry routing and access-path prices are in
`ops/registry/system1-tasks.json` (`routes`), keyed by the same `pathId`
convention as `ops/registry/capacity.json`.

## Call a task

```js
import { system1Call } from './scripts/lib/system1/router.mjs';
const r = await system1Call({ task: 'backlog-readiness', state: issueText, key: 'JOV-123' });
// r.decision: 'ready' | 'not_ready' | null (abstained or error: use your existing path)
```

Shell and Python: `node scripts/system1.mjs call --task T --key K --state-file -`
(exit 0 ok, 75 provider error/over budget). A provider failure never throws.

Every call appends a row (`jovie.system1-call/v1`) with the task, prompt version,
route (`pathId`, access path, funding), input hash, choice, probabilities,
decision, latency, tokens, cost (gateway-reported when available, else list
price by access path) and the caller's `key`. Tasks with `retainInput: true`
also keep the input under `inputs/<hash>.json` so the eval set can replay it.
Do not enable that for tasks that carry end-user personal data.

State lives in `JOVIE_SYSTEM1_STATE`, else `<lanes state>/system1` (Gem:
`~/.local/state/jovie-lanes/system1`).

## Ground truth arrives later

`node scripts/system1.mjs label --task T --key K --label L --source S` (or a
labeler) appends a label row. The newest label per `(task, key)` wins, so a later
correction replaces an earlier outcome. `label-outcomes` runs the task's
labeler over an outcome source; today `backlog-readiness` reads the lanes Linear
mirror (reached Validating/Merging/In Review = ready; Rework or a blocked /
human-decision label = not_ready; everything else stays unlabeled).

## Tune

`node scripts/system1.mjs tune --task T [--apply]` splits the labeled items
deterministically (about 30% held out by item id), proposes candidates, scores
the current version and each candidate on the same held-out items, and promotes
the best one only if all hold:

1. at least `minHeldout` held-out items,
2. every task guardrail passes on the candidate (precision, recall, false-positive
   rate, coverage, abstain),
3. objective gain >= 0.02,
4. net wins >= 2, where an item is a win when the candidate's outcome is better
   (right = +1, abstain = 0, wrong = -1).

Levers, cheapest first: recalibrated abstain floor (offline), recalibrated
positive-class cutoff (offline), few-shot examples built from verified mistakes,
another route (Jev vs Clef), and a cutoff recalibrated on replayed train items
for each replayed variant. Replays are logged with `replay: true` and excluded
from volume, accuracy and joins; their cost shows as tuning cost.

A promoted version is stored in `versions/<task>.json` with its parent and the
held-out evidence; the router uses the active pointer. `rollback --task T` moves
the pointer back one step (to the baseline `v1` when there is no earlier tuned
version). `weekly` runs label-outcomes, tune --apply for every task, and writes
`reports/latest.json` (per-task volume, cost, latency, label coverage, quality,
weekly trend, tuning outcome) for Ovie and the liveness check.

## Fine-tuning paths (checked 2026-10-25)

- Clef: Cloudflare launched a managed RL fine-tuning service with the models
  (Oct 1 2026): forward-deployed-engineer led, design-partner form for existing
  customers, self-serve platform announced with no date, no public pricing.
  Datasets can come from AI Gateway logs; the tuned model is served through
  Workers AI "bring your own model". The weights are open (Apache 2.0), so a
  self-run LoRA is possible on our own GPU but is not set up. Both are Tim asks
  (outbound form, unpriced spend).
- Jev: no public tuning path found; TypeSafe console is the place to ask.
- Until either lands, prompt/few-shot, thresholds/cutoffs and route choice are
  the levers; the ledger and eval sets are the datasets a fine-tune would use.

## Add a task

Add an entry to `ops/registry/system1-tasks.json` (labels, positive class,
objective, guardrails, baseline prompt/routes, label sources), call it through
`system1Call`, and either write a labeler in `scripts/lib/system1/labelers.mjs`
or call `label` from the loop that learns the outcome.
