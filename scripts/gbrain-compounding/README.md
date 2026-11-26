# GBrain knowledge compounding (health digest → durable claims)

Smallest landed slice of
[`docs/spikes/gbrain-knowledge-compounding.md`](../../docs/spikes/gbrain-knowledge-compounding.md):
turn the daily GBrain health digest into durable, searchable claims agents
reuse instead of re-deriving ops facts.

## What it writes (when gbrain is live)

| Slug | Purpose |
|---|---|
| `ops/gbrain-health/latest` | Latest digest body + machine JSON block |
| `ops/gbrain-health/claims/<YYYY-MM-DD>/status` | Overall status claim for the day |
| `ops/gbrain-health/claims/<YYYY-MM-DD>/<check>` | One claim per probe |
| `ops/gbrain-health/claims/index` | Rolling claim index + trend JSON |

Write contract: `gbrain put` then `gbrain get` read-back must contain the page
tail (same idea as `scripts/lanes/yc_corpus.py`).

## Run

```bash
# Live probes + compound (requires gbrain CLI + local health endpoint)
node scripts/gbrain-compounding/run.mjs --buffer-dir "$TMPDIR/gbrain-compound"

# From a fixture digest (CI / offline)
node scripts/gbrain-compounding/run.mjs --digest-file fixture.json --dry-run

# Explicit needs-probe path when CLI missing: exit 0, status needs-probe
node scripts/gbrain-compounding/run.mjs --digest-file fixture.json --buffer-dir /tmp/out
```

Env:

| Variable | Default | Role |
|---|---|---|
| `JOVIE_GBRAIN_BIN` / `HERMES_GBRAIN_BIN` | `gbrain` | CLI binary |
| `JOVIE_GBRAIN_HEALTH_URL` / `HERMES_GBRAIN_HEALTH_URL` | `http://127.0.0.1:7801/health` | HTTP probe |

## Degrade semantics

| Status | Exit | Meaning |
|---|---:|---|
| `compounded` | 0 | All pages put + read-back verified |
| `dry-run` | 0 | No writes |
| `needs-probe` | 0 | gbrain CLI/daemon unavailable — pages buffered when `--buffer-dir` set; never silent |
| `degraded` | 1 | Partial write/read-back failure that is not a clean unavailable |

## Schedule

No new GitHub/Vercel cron (JOV-INV-042 allowlist frozen; spike says control-plane
jobs, not product traffic). Run from:

1. Local/Gem Hermes unit that already owns
   `co.jovie.hermes.cron-gbrain-health-summary` — after the symphony-control
   health summary, invoke this compounder on the same host.
2. `workflow_dispatch` on `.github/workflows/gbrain-compounding.yml` for
   fixture verification (expects `needs-probe` in CI without gbrain).

## Tests

```bash
node --test scripts/gbrain-compounding/gbrain-compounding.test.mjs
```
