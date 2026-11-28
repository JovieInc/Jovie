<!--
spec-version: 1.0.0
doc-freshness: docs/design-system/MEDIA_RSI_CONTRACT.md
-->
# Media RSI contract — reusable loop (image / video / music)

**Audience:** homepage and marketing-media owners coordinating generation work.  
**Not:** a second design project, a visual scorecard, or authorization for
production / paid generation from this brief.

Canonical routing stays in
[`MEDIA_GENERATION.md`](./MEDIA_GENERATION.md). This document only captures the
**operating contract** so recurring media defects become guardrails instead of
one-off taste debates.

## Contract

```
input
  → refine
  → bounded auto-scale across seeds / models / reference weights
  → cheap System 1 eval + hard gates
  → independent exact assembled-page certification
  → keep last green
  → retarget the weakest part
  → turn validated recurring defects into guardrails + regression fixtures
```

Applies to **image**, **video**, and **music** lanes that already exist under
`MEDIA_GENERATION.md`. Do not invent a parallel generator.

## Rules of evidence

1. **No visual score in lieu of proof.** A rubric number is not assembled-page
   certification.
2. **Keep last green.** Retarget only the weakest failing part; do not reset a
   working seed/model/weight combo without a receipt.
3. **Hard gates before scale.** System 1 eval is cheap triage; hard gates and
   independent page certification decide ship.
4. **Recurring defects → fixtures.** Once a miss is verified twice, encode it
   (ASR / review-findings / LESSONS guard) instead of re-prompting.
5. **No production or paid generation from this brief.** Coordination and
   contract only; spend stays with the current homepage / media owner.

## Coordination handoff

| Step | Owner | Artifact |
|---|---|---|
| Input brief + constraints | Homepage / marketing owner | existing recipe / brief |
| Refine + bounded scale | Media lane owner (`marketing-media`, etc.) | seed/model/weight matrix |
| System 1 + hard gates | Existing art/vision gates | gate receipts |
| Assembled-page certification | Independent cert path | page-level pass/fail |
| Defect → guardrail | Encoding PR (anti-slop / review-findings / LESSONS) | ASR id + fixture |

## Out of scope here

- New models, providers, or paid API calls
- Replacing Pen / homepage ownership
- Shipping media behind a “score ≥ N” alone
