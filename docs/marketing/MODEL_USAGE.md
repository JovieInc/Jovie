<!--
spec-version: 1.0.0
doc-freshness: docs/marketing/MODEL_USAGE.md
-->
# Model usage ledger

Runtime model names, token counts, durations, and billing were not exposed to
delegated agents. Those values are recorded as unavailable rather than guessed.

| Task ID | Role | Agent/model | Frontier or escalation reason | Duration | Tokens | Estimated cost |
|---|---|---|---|---|---|---|
| AUDIT-REGISTRY | bounded audit: registries, recipes, route manifest | unavailable from runtime | orchestration assigned a read-only architecture inventory | unavailable from runtime | unavailable from runtime | unavailable from runtime |
| AUDIT-ROUTES-UI | bounded audit: routes and review surfaces | unavailable from runtime | orchestration assigned independent evidence gathering | unavailable from runtime | unavailable from runtime | unavailable from runtime |
| AUDIT-GATES | bounded audit: tests and enforcement | unavailable from runtime | orchestration assigned independent gate inventory | unavailable from runtime | unavailable from runtime | unavailable from runtime |
| IMPLEMENT-GOVERNANCE | implementation: data contract, bindings, tests, docs | unavailable from runtime | bounded economical implementation; no frontier escalation reported | unavailable from runtime | unavailable from runtime | unavailable from runtime |
| IMPLEMENT-GALLERY | implementation: review gallery | unavailable from runtime | bounded economical implementation; owned by a separate task | unavailable from runtime | unavailable from runtime | unavailable from runtime |
| IMPLEMENT-GUARD | implementation: production one-off guard | unavailable from runtime | bounded economical implementation; owned by a separate task | unavailable from runtime | unavailable from runtime | unavailable from runtime |
| ORCHESTRATOR-REVIEW | architecture and diff review | unavailable from runtime | frontier role reserved for architecture conflict resolution and review | unavailable from runtime | unavailable from runtime | unavailable from runtime |
| ORCHESTRATOR-VERIFY | final integration and exhaustive verification | unavailable from runtime | frontier role reserved for final verification | unavailable from runtime | unavailable from runtime | unavailable from runtime |

Update this ledger when the orchestrator can observe actual usage. Never infer
cost from wall time or prose output.
