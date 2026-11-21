# AI Model Successor Policy (auto-routing with spend guard)

**Status: DRAFT — PENDING TIM CONFIRMATION.** The rule and the +5% threshold
below were relayed by Grok Bot from Tim (2026-11-19). They are **not yet
confirmed in Tim's own words to Symphony**. Nothing routes on this policy
until (1) Tim confirms the rule and the threshold, and (2) the event-driven
trigger lands. Tracked in Linear JOV-13153 (child of JOV-13141, related to
JOV-13151).

## The rule

When a covered flash-tier model — **GLM 5.3 Flash** (`zai/glm-5.3-flash`,
Gateway id) or **DeepSeek V4.1 Flash** (`@cf/deepseek-ai/deepseek-v4.1-flash-1017`,
the current Workers AI twin) — has a clear successor available (on Cloudflare
or elsewhere), route to the successor automatically without asking.

**Spend guard first.** Compare blended per-token cost before any switch:

```
blended $/M tokens = (inputTokens × inputUsdPerM + outputTokens × outputUsdPerM)
                     ÷ (inputTokens + outputTokens)
```

weighted by our real usage mix (default 20k input + 1k output tokens per turn,
from the task-registry costBasis estimates; an evaluator with measured token
counts passes its own mix).

- Successor costs the **same or less** → switch.
- Successor costs **at most +5% more** (blended) → switch. The +5% is Grok's
  working threshold and is **PENDING TIM CONFIRMATION**.
- Successor costs **more than +5% above** current → **never switch silently** —
  refuse and flag Tim with the price delta.

## Fail-closed semantics

The successor-switch path refuses (and flags Tim) when:

1. **Successor pricing is missing or unusable** — never switch on unknown cost.
2. **Current-model pricing is missing or unusable** — the delta cannot be
   computed, so it cannot be proven within budget.
3. **The blended delta is above the threshold** — refuse with the delta.
4. **The usage mix is unusable** — refuse rather than blend on garbage weights.

A boundary switch at exactly +5% is allowed ("at most +5%"); floating-point
noise at the boundary is absorbed by a fixed epsilon in the policy module.

### Worked example (real list prices, 2026-11-19)

- GLM 5.3 Flash (Gateway list): $0.20/M input, $1.50/M output.
- DeepSeek V4.1 Flash: $0.30/M input, $1.20/M output.

On the default 20k/1k mix:

- GLM 5.3 Flash blended: (20 000 × 0.20 + 1 000 × 1.50) ÷ 21 000 ≈ **$0.262/M**
- DeepSeek V4.1 Flash blended: (20 000 × 0.30 + 1 000 × 1.20) ÷ 21 000 ≈ **$0.343/M**

Delta ≈ **+31%** — far above +5%, so an event proposing this as a *successor*
switch would be **refused and flagged to Tim**, not routed automatically.
(This is a pricing example only — the JOV-13141 deprecation swap was a
hard cutoff, not a policy decision, and is not governed by this rule.)

## Trigger: event-driven only

The policy is evaluated when an **event** proposes a successor — a Cloudflare
changelog / deprecation notice or a model-catalog change — delivered as a
`repository_dispatch` (types such as `model-catalog-change`,
`cloudflare-model-deprecation`). **Never polling, never cron, no feature
flag, no ALLOW=1.** The event producer and the workflow that evaluates
proposals land via the Eve Runtime Owner's Mac/gh lane; the proposed workflow
diff lives in the JOV-13153 PR body, not in the repo.

## Where things live

| Piece | Location |
| --- | --- |
| Policy + pure decision function (single source of truth for the threshold) | `apps/web/lib/ai/successor-policy.ts` |
| Config default (mirror, cross-checked by the test) | `apps/web/lib/ai/routing.json` → `successorPolicy` |
| Task-registry pointer | `ops/models/task-registry.json` → `successorPolicy` |
| Fail-closed guard test | `apps/web/tests/unit/lib/ai/successor-policy.test.ts` |

The unit test cross-checks the config mirrors against the module constants, so
the threshold or covered-model list can never drift between code and config.

## When it activates

1. Tim confirms the rule and the +5% threshold in his own words to Symphony.
2. The event trigger (producer + workflow) lands via the Eve Runtime Owner's
   Mac/gh lane.
3. Only then does any automatic switch path run — and every refusal still
   flags Tim with the delta.
