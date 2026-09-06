# Symphony provider-admission authority

As of the source tree on `origin/main`, the official execution domain is the
`symphony-elixir.service` runtime on port 4041. `scripts/symphony/WORKFLOW.md`
selects `symphony-agent-router app-server`; that launcher accepts only the
native Codex app-server transport. Cursor, Grok, and Kimi use the isolated
fallback worker's ordinary CLI executor contract.

| Component | Status | Admission or mutation responsibility |
| --- | --- | --- |
| `symphony-agent-router` | active | Holds the issue flock, verifies Codex app-server capacity, writes `symphony-provider-route/v1`, and execs the verified Codex route. It never adapts a CLI-only provider into the official app-server protocol. |
| `symphony-codex-router` | active child | Verifies the materialized `symphony-routing/v1` route and execs the selected Codex process; it does not select a second provider or create an issue lease. |
| `symphony_official_runtime.py` | active wrapper | Owns runtime stop-line admission (fresh Summer closure-health), rate-limit gating, and dead-letter enforcement; it does not select or spawn a provider. |
| `symphony-codex-exhausted.py` / `symphony-grok-sidecar` | fallback lane | Derives Cursor/Grok/Kimi CLI executors from the model registry, shares the issue lease protocol, and adapts capacity per provider and lane. It is not allowed to mutate the official 4041 runtime's provider route. |
| `symphony-concurrency-controller.py` | observer/overlay | Reads provider and runtime evidence and may change only the bounded workflow concurrency scalar. It cannot select a route, reserve an issue, or spawn a worker. |
| `symphony-reconciler.py` | retired by the official updater | Source remains for compatibility/readback tests; `update-symphony-burrito.sh` places its unit in `LEGACY_UNITS`, so it is not an installed active mutator. |
| `WORKFLOW.jovie-ui-pilot.md` | retired | Legacy fixture only; it is not the official workflow and is excluded by the official updater. |

Every route receipt written by the active launcher binds the Codex route,
authority, issue reservation, and inherited lease. The same stable issue-lock
pathname fences isolated fallback pickup, while `provider_capacity.py` owns
provider-local admit, backoff, recovery, and lane reservation decisions.

Unknown probe results remain non-authoritative. The official launcher returns
typed retryable capacity when Codex cannot enter app-server; the isolated
fallback worker may independently select a registry-backed CLI provider under
the same issue lease.
