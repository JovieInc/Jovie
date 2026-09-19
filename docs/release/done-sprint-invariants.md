# Done sprint invariants are release blockers

<!-- JOV-INV-033 -->

Linear `Done` is a work-item state. It is not proof that production still
matches the shipped invariant. JOV-6441 makes a Done-sprint regression a
**release blocker**: missing evidence, scanner errors, and live contradictions
fail closed.

## Policy

1. A Done issue that encoded a production invariant stays in a seed catalog
   until a later explicit supersession.
2. Source CI (`pnpm invariants:check`) rescans the certified files. A revert
   or contradiction cannot land.
3. Production controller release mode (`DONE_INVARIANT_RESCAN=release`)
   rescans live HTML. A missing base URL, failed fetch, or forbidden offer
   blocks `Production Verified`.
4. Do not mark the Linear issue Done again to silence a red rescan. Repair
   the source or the live page.

## Seed catalog (start here)

| Issue | Invariant | Source lock | Production contradiction |
|---|---|---|---|
| JOV-6218 | Pricing truth | Monthly Pro $199 / 14-day trial; Max is contact sales; no annual or Max self-serve signup | `/pricing` or `/` still links `signup?plan=max` or annual Pro checkout |
| JOV-6260 | Directory hygiene | HTML directory uses the same discovery filter as XML; cache bust includes `/artists` | `/artists` still lists QA/test identities |

## Add the next Done invariant

1. Add a seed row in `scripts/invariants/done-sprint-invariants.mjs`.
2. Name the files, required claims, and forbidden public strings.
3. Add a deliberate-red fixture that would have shipped the regression.
4. Keep Linear as the durable follow-up if a live page needs a later repair.

Executable identity: `JOV-INV-033`.
`gbrain-unavailable` for this change; refresh from source/runtime.
