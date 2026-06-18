# gbrain Supabase pool budget

Jovie agents and Hermes cron wrappers call the external `gbrain` CLI. On
Supabase-backed brains, each process opens its own Postgres pools (defaults:
read pool 10 + direct pool 3). Overlapping processes — `gbrain serve`, autopilot
ticks, `gbrain sync`, Codex hooks — multiply connections and can trigger
`EMAXCONNSESSION` / "connections exhausted" on low-cap Supavisor tiers.

PGLite engines (Hermes-Air default) do not use Postgres pooling; this doc does
not apply there.

## Env vars

| Variable | Default (when clamp applies) | Purpose |
|---|---:|---|
| `GBRAIN_DISABLE_DIRECT_POOL` | `1` | Single-pool mode; avoids doubling connections per process |
| `GBRAIN_POOL_SIZE` | `2` | Read/pooler pool size per process (gbrain default is 10) |
| `GBRAIN_DIRECT_POOL_SIZE` | `1` | Direct `:5432` pool size when direct pool is enabled |
| `GBRAIN_MAX_CONNECTIONS` | `15` | Opt-in per-process budget clamp for parallel sync workers (gbrain v0.42+) |
| `GBRAIN_POOL_BUDGET_DISABLED` | unset | Set to `1` to skip Jovie's auto-clamp helper |

Set `GBRAIN_MAX_CONNECTIONS` to your Supabase **session pooler** `pool_size`
(not raw Postgres `max_connections`). Supavisor free tiers are often 15–20.

## Where Jovie applies the clamp

- `scripts/codex-gbrain-sync.sh` — sources `scripts/lib/gbrain-pool-env.sh` before
  `gbrain doctor` / sync during Codex session hooks.
- `scripts/lib/gbrain-pool-env.mjs` — shared detection (Supabase vs PGLite) and
  defaults; unit-tested.

Operator-owned surfaces (not rendered by this repo) still need the same exports:

- `~/.zshrc` / shell profile for ad-hoc `gbrain` CLI
- launchd plists / cron wrappers on the always-on MacBook Pro
- `gbrain serve` / autopilot long-lived processes

## Recommended operator setup (MacBook Pro, Supabase brain)

Add to shell profile or a dedicated `~/.gbrain/env` sourced by cron:

```bash
export GBRAIN_DISABLE_DIRECT_POOL=1
export GBRAIN_POOL_SIZE=2
export GBRAIN_DIRECT_POOL_SIZE=1
export GBRAIN_MAX_CONNECTIONS=15
```

Upgrade gbrain to v0.42+ (see JovieInc/Jovie#10458) so `pool_budget` doctor check
and the `GBRAIN_MAX_CONNECTIONS` clamp are available.

## Verification

```bash
gbrain doctor --json | jq '.checks[] | select(.name=="pool_budget")'
```

Expect `status: "ok"` with a message showing room for parallel sync workers.
In Supabase SQL editor:

```sql
select state, wait_event_type, count(*)
from pg_stat_activity
where datname = current_database()
group by 1, 2
order by 3 desc;
```

Steady-state connections should stay well under tier cap; no long-lived
`ClientRead` orphans after SIGKILL'd autopilot runs.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `EMAXCONNSESSION` / pool_size exceeded | Too many overlapping gbrain processes × default pool sizes | Lower `GBRAIN_POOL_SIZE`; ensure clamp env is set in **every** wrapper |
| `pool_budget` warns "no room for parallel sync worker" | `GBRAIN_MAX_CONNECTIONS` too low for parent pool | Lower `GBRAIN_POOL_SIZE` or raise `GBRAIN_MAX_CONNECTIONS` |
| Errors only on Codex sessions | Shell wrappers clamped but serve/autopilot are not | Add env to launchd/cron for long-lived processes |
| PGLite brain on Air | N/A — pool env is intentionally skipped | No action |

## Related

- GitHub issue: [JovieInc/Jovie#10815](https://github.com/JovieInc/Jovie/issues/10815)
- Linear: [JOV-3123](https://linear.app/jovie/issue/JOV-3123)
- gbrain upstream env docs: `GBRAIN_POOL_SIZE` in garrytan/gbrain `src/core/db.ts`
- Hermes-Air (PGLite): [`docs/HERMES_AIR.md`](./HERMES_AIR.md)