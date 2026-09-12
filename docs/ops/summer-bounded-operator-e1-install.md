# Summer bounded-operator — E1 attestation install packet

## Goal

Close the JOV-6163 / PR #17725 repair-to-runtime gap so Summer can admit work
from fresh runner-source attestations (≤600s) without holding on
`runner-source-attestation-unavailable`.

## Local readiness (completed in this branch)

| Check | Result |
|---|---|
| PR [#17725](https://github.com/JovieInc/Jovie/pull/17725) | **MERGED to `main`** (merge commit `6f617b3d61`, 2026-09-12) — publisher is on the default branch |
| Publisher unit tests `scripts/symphony/tests/gem-service-attestation.test.py` | **9 passed** on merged main |
| Summer governed dispatch + Gem-down acceptance (local) | PASS — Cursor alternate selected without Gem; hold when no probe |
| 600s freshness gate weakened? | **No** |
| Live Gem install + two ≤600s observations | **EXTERNAL** — this cloud agent has no Gem SSH; `gem.jovie.ai:22` times out from agent network |

Local publisher proof command (from `main` after merge):

```bash
git fetch origin main
python3 scripts/symphony/tests/gem-service-attestation.test.py
```

## Prerequisites (operator)

- Gem host install authority (SSH / fleet installer). Publisher code is already on `main` via #17725.
- Operator-selected nonsecret values in `~/.config/symphony/runner-source.env`:
  - `SYMPHONY_RELEASE_PROVENANCE=/absolute/path/to/verified-release.provenance.json`
  - `JOVIE_CONFIGURATION_SOURCE_ROOT=/absolute/path/to/jovie-git-repository`
  - `JOVIE_CONFIGURATION_SOURCE_REVISION=<full-40-character-configuration-commit>`

## Install steps (Gem — external authority)

1. Deploy/sync `main` (includes #17725) onto the Gem runtime release channel Summer reads.
2. Before replacement, run:
   `emit_gem_service_attestation.py --check --provenance … --source-root … --source-revision …`
   - exit 0 = measured inputs match
   - exit 2 = observed but unhealthy
   - exit 78 = observation could not be verified
3. Install `emit_gem_service_attestation.py` at
   `~/gem-workspace/scripts/emit-gem-service-attestation.py` with its
   `symphony_proof_context.py` and `gem_gate_contract.py` dependencies.
4. Install checked-in `systemd/gem-service-attestation.service` over the existing
   user unit. Preserve a rollback copy of the prior publisher and unit.
5. Pause only the existing attestation timer while installing; do **not** restart
   Symphony. Reload user units and resume the same timer.
6. Confirm publisher health: attestation with `observedAt` ≤600s and valid
   signature over the live release digest.
7. Independent observer A: present + fresh + signature valid.
8. Wait >0s and ≤600s; independent observer B with the same predicates.
9. Exercise Summer admission on a harmless read-only decision job; confirm it
   no longer holds on `runner-source-attestation-unavailable`.

## Acceptance evidence to attach

- PR #17725 URL + merge/deploy SHA on Gem
- Observation A and B timestamps + attestation digests
- Summer admission receipt showing attestation freshness OK
- Explicit statement that the 600s freshness gate was not weakened

### Post-install proof command (required)

After collecting two attestation JSON files from Gem (independent, each ≤600s),
run Summer's observation gate — same evaluator + governed-dispatch predicates:

```bash
node scripts/summer-commissioning/verify-e1-attestation-observations.mjs \
  --observation-a /path/to/observation-a.json \
  --observation-b /path/to/observation-b.json
# writes /opt/cursor/artifacts/e1-attestation-observations-receipt.json
# exit 0 = E1 close-path PASS (Symphony restored); exit 2 = observations failed
```

Local readiness only (does **not** close E1):

```bash
node scripts/summer-commissioning/verify-e1-attestation-observations.mjs --self-test
```

## Repair-to-runtime bridge (this branch)

Summer bottleneck heartbeat evaluates runner-source attestation, then runs
**governed dispatch** (`dispatchSummerGovernedRequest`) so the request outcome
selects the router launch:

1. Load `SUMMER_RUNNER_SOURCE_ATTESTATION_JSON` or the file at
   `SUMMER_RUNNER_SOURCE_ATTESTATION_PATH`.
2. Governed dispatch outcomes:
   - `symphony-route` — fresh ≤600s attestation (Symphony remains authoritative)
   - `cursor-recovery-request` — missing/invalid/stale/unhealthy/unbound receipt
     (**including age >600s**) or explicit `SUMMER_GEM_DARK` → Cursor outbox only
     (never Gem)
   - `hold` — no probe configured → no Cursor spend
3. Only `cursor-recovery-request` advances the Gem-dark Cursor recovery cycle /
   durable outbox.
4. `SUMMER_GEM_DARK=live` wins over a missing receipt (operator override).
5. PATH alone (without loading the file) does **not** imply dark — avoids
   accidental Cursor spend; the heartbeat always loads first.

**Required for the bridge to arm:** set
`SUMMER_RUNNER_SOURCE_ATTESTATION_PATH` (or `_JSON`) on the Summer runtime to
the live Gem attestation file. If neither probe is configured, Summer
fail-closes to “not dark” (no Cursor spend). A configured path whose file is
missing/unreadable counts as unavailable → Cursor outbox.

Schema match (must equal Symphony concurrency controller):
`gem-service-attestation/v1` + `sourceRevision` (40 hex) + `observedAt` +
`active`/`healthy` + `listener.port===4041` + `listener.boundToService===true`.

Local Gem-down acceptance narrative (does not close E1):

```bash
pnpm --dir apps/eve-pilot exec vitest run --config vitest.config.ts \
  tests/summer-bounded-operator-acceptance.test.ts
# writes /opt/cursor/artifacts/summer-bounded-operator-acceptance-receipt.json
```

## Pre-install gates (read before touching Gem)

Do **not** install the JOV-6163 publisher until these are true, or E1 fails closed
/ Summer routes into Cursor recovery spend:

1. **Config drift must be healthy first.**  
   `python3 scripts/symphony/emit_gem_service_attestation.py --check …` must exit **0**.
   Live unit drop-ins (`workspace-mounts.conf`, `90-symphony-safe-restart-guard.conf`)
   must match `scripts/symphony/systemd/symphony-elixir.service.d/<basename>` at the
   selected configuration revision. Unknown or drifted drop-ins keep `healthy:false`.

2. **Activation installs the publisher (after #17736).**  
   Before that lands, activation only installs fleet / PR-rehab controllers. After it
   lands, activation copies the emitter onto the existing `gem-service-attestation`
   timer path and verifies `configurationSourceRevision` (Jovie tip). Still fail-closed
   when `~/.config/symphony/runner-source.env` is missing or `--check` is unhealthy.

3. **Gem → Summer transport.**  
   Summer (Vercel) reads `SUMMER_RUNNER_SOURCE_ATTESTATION_PATH` / `_JSON`. Host-local
   files on Gem are not visible to Summer. Wire signed snapshot/env transport before
   claiming admission green. Static env goes stale inside the 600s window by design.

4. **Public DNS is not Gem.**  
   `gem.jovie.ai` from the public internet is a parking lander. Operator access is the
   self-hosted `jovie-fixed` runner / Gem shell — not Cloud Agent egress.

**E1 close proof (not self-test):** live-mode receipt, two real 40-hex `sourceRevision`s,
age ≤600s at verify time, `weakened600sGate: false`, and Summer admission no longer
holding on `runner-source-attestation-unavailable`. Anything with `mode: "self-test"`
is readiness only.

## Named external blocker

**Owner:** Gem operator / Symphony fleet owner  
**Blocker:** This agent cannot SSH Gem or select live release provenance.  
**Unblock when:** Steps 1–9 above produce two ≤600s observations and Summer
admission no longer holds on `runner-source-attestation-unavailable`.

## Out of scope / do not

- Do not bypass or extend the 600s attestation freshness window
- Do not grant Summer privileged GBrain write or Symphony heal
- Do not claim E1 green from local unit tests alone — Gem install is required
- Do not install the publisher solely to “make E1 green” while `--check` is non-zero
- Do not re-pin provenance to force `healthy:true` against live drift

## Related local gates (automated)

```bash
node scripts/summer-commissioning/bounded-operator-evals.mjs
```
