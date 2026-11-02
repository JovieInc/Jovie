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

## Add a task

Add an entry to `ops/registry/system1-tasks.json` (labels, positive class,
objective, guardrails, baseline prompt/routes, label sources), call it through
`system1Call`, and either write a labeler in `scripts/lib/system1/labelers.mjs`
or call `label` from the loop that learns the outcome.
