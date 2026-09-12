# Summer bounded-operator — E1 attestation install packet

## Goal

Close the JOV-6163 / PR #17725 repair-to-runtime gap so Summer can admit work
from fresh runner-source attestations (≤600s) without holding on
`runner-source-attestation-unavailable`.

## Prerequisites

- PR https://github.com/JovieInc/Jovie/pull/17725 is mergeable and CI-green
  (runtime attestation publisher bound to live release source).
- Operator has Gem install authority for the Summer/Symphony control plane.
- Wall-clock observation window available for two independent freshness checks.

## Install steps

1. Merge or cherry-pick PR #17725 onto the Gem runtime release channel that
   Summer reads for runner-source attestation.
2. Deploy/restart the attestation publisher on Gem so it emits signed
   observations for the live release source (not a stale fixture channel).
3. Confirm publisher health: at least one attestation record with
   `observedAt` within the last 600 seconds and a valid signature over the
   live release digest.
4. From an independent observer (not the publisher process), record
   observation A: attestation present, fresh (≤600s), signature valid.
5. Wait >0s and ≤600s, then record observation B with the same predicates.
6. Exercise Summer admission against a harmless read-only decision job and
   confirm it no longer holds on `runner-source-attestation-unavailable`.

## Acceptance evidence to attach

- PR #17725 URL + merge/deploy SHA on Gem
- Observation A and B timestamps + attestation digests
- Summer admission receipt showing attestation freshness OK
- Explicit statement that the 600s freshness gate was not weakened

## Out of scope / do not

- Do not bypass or extend the 600s attestation freshness window
- Do not grant Summer privileged GBrain write or Symphony heal
- Do not claim E1 green from local unit tests alone — Gem install is required

## Related local gates (already automated)

- E2/E5 operational memory + identity: `pnpm --filter @jovie/web exec vitest run tests/unit/ovie/operational-memory.test.ts tests/unit/ovie/identity.test.ts`
- E3/E4 Cursor recovery: `pnpm --filter @jovie/eve-pilot exec vitest run tests/cursor-recovery.test.ts`
- Combined local gate: `node scripts/summer-commissioning/bounded-operator-evals.mjs`
