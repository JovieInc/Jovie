# Symphony provider-admission authority

As of the source tree on `origin/main`, the official execution domain is the
`symphony-elixir.service` runtime on port 4041. `scripts/symphony/WORKFLOW.md`
selects `symphony-agent-router app-server`; that router is the only normal
primary/fallback launch entrypoint.

| Component | Status | Admission or mutation responsibility |
| --- | --- | --- |
| `symphony-agent-router` | active | Holds the issue flock, probes eligible providers, selects the primary or approved fallback, and writes `symphony-provider-route/v1`. |
| `symphony-codex-router` | active child | Verifies the materialized `symphony-routing/v1` route and execs the selected Codex process; it does not select a second provider or create an issue lease. |
| `symphony_official_runtime.py` | active wrapper | Owns runtime stop-line admission (fresh Summer closure-health), rate-limit gating, and dead-letter enforcement; it does not select or spawn a provider. |
| `symphony-codex-exhausted.py` / `symphony-grok-sidecar` | fallback lane | Owns the separately installed Grok/Kimi recovery lane and its existing issue lease protocol. It is not allowed to mutate the official 4041 runtime's provider route. |
| `symphony-concurrency-controller.py` | observer/overlay | Reads provider and runtime evidence and may change only the bounded workflow concurrency scalar. It cannot select a route, reserve an issue, or spawn a worker. |
| `symphony-reconciler.py` | retired by the official updater | Source remains for compatibility/readback tests; `update-symphony-burrito.sh` places its unit in `LEGACY_UNITS`, so it is not an installed active mutator. |
| `WORKFLOW.jovie-ui-pilot.md` | retired | Legacy fixture only; it is not the official workflow and is excluded by the official updater. |

Every route receipt written by the active router now binds the authority,
policy generation, selected route, issue reservation, and inherited lease. The
reservation is an issue-exclusivity reservation; provider-slot accounting
continues to use the existing provider-capacity authority owned by the
capacity-gate workstream. This keeps this change from introducing a second
capacity store or controller.

Unknown probe results remain non-authoritative: the router can fall through to
the next provider in the same launch, but it never treats an unknown result as
permission to stop the official runtime or to transfer an issue to an
unrelated controller.
