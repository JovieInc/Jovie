# Summer bounded-operator — E1 attestation install packet

## Goal

Close the JOV-6163 / PR #17725 repair-to-runtime gap so Summer can admit work
from fresh runner-source attestations (≤600s) without holding on
`runner-source-attestation-unavailable`.

## Local readiness (completed in this branch)

| Check | Result |
|---|---|
| PR [#17725](https://github.com/JovieInc/Jovie/pull/17725) open on `codex/jov-6163-runtime-attestation` | OPEN |
| CI `Validate exact PR head proof v2` | SUCCESS |
| Publisher unit tests `scripts/symphony/tests/gem-service-attestation.test.py` | **9 passed** (2026-09-12) |
| 600s freshness gate weakened? | **No** |

Local publisher proof command (from PR head):

```bash
git fetch origin codex/jov-6163-runtime-attestation
git worktree add /tmp/jov-6163-attestation origin/codex/jov-6163-runtime-attestation
python3 /tmp/jov-6163-attestation/scripts/symphony/tests/gem-service-attestation.test.py
```

## Prerequisites (operator)

- Merge authority for PR #17725 onto the Gem runtime release channel Summer reads.
- Gem host install authority (SSH / fleet installer).
- Operator-selected nonsecret values in `~/.config/symphony/runner-source.env`:
  - `SYMPHONY_RELEASE_PROVENANCE=/absolute/path/to/verified-release.provenance.json`
  - `JOVIE_CONFIGURATION_SOURCE_ROOT=/absolute/path/to/jovie-git-repository`
  - `JOVIE_CONFIGURATION_SOURCE_REVISION=<full-40-character-configuration-commit>`

## Install steps (Gem — external authority)

1. Merge or cherry-pick PR #17725 onto the Gem runtime release channel.
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

## Repair-to-runtime bridge (this branch)

Summer bottleneck heartbeat now evaluates runner-source attestation before the
Gem-dark recovery cycle:

1. Load `SUMMER_RUNNER_SOURCE_ATTESTATION_JSON` or the file at
   `SUMMER_RUNNER_SOURCE_ATTESTATION_PATH`.
2. `resolveGemDarkTrigger` admits the Cursor outbox lane when the receipt is
   missing/invalid/stale/unhealthy/unbound (**including age >600s**), or when
   `SUMMER_GEM_DARK` is explicitly dark.
3. Fresh ≤600s attestations keep the normal symphony path authoritative.
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

## Named external blocker

**Owner:** Gem operator / Symphony fleet owner  
**Blocker:** This agent cannot SSH Gem or select live release provenance.  
**Unblock when:** Steps 1–9 above produce two ≤600s observations and Summer
admission no longer holds on `runner-source-attestation-unavailable`.

## Out of scope / do not

- Do not bypass or extend the 600s attestation freshness window
- Do not grant Summer privileged GBrain write or Symphony heal
- Do not claim E1 green from local unit tests alone — Gem install is required

## Related local gates (automated)

```bash
node scripts/summer-commissioning/bounded-operator-evals.mjs
```
