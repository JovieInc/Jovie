# Escaped-defect closure

Status: shipping. Owner: Summer. Issue: JOV-7201. Related compiler: JOV-7084.

An issue labeled `escaped-defect` stays open when its repair PR merges. Merge is
not activation, and a product fix is only half of the required outcome. Closure
uses the existing Linear issue, Quality Gap Finder, and production evidence; it
does not create a second governor or incident record.

## Required loop

1. Reproduce the reported failure and retain an evidence reference.
2. Repair the product and retain the fixing PR or commit reference.
3. Verify the affected journey against an exact deployed build.
4. Explain why certification, dogfood, or monitoring missed it.
5. Add a reusable detector for the failure class, or record an evidenced,
   explicitly approved non-applicability disposition.
6. Run a representative deliberate-red replay that the detector rejects.
7. Retest the original report after deployment.
8. Attach the receipt below to the originating Linear issue and only then use
   `PRODUCTION_VERIFIED_SHA=<full-sha> scripts/linear-transition-issue.mjs <JOV-ID> Done`.

`linear-sync-on-merge` never closes an escaped defect. The guarded transition
CLI validates the receipt before moving it to Done. The existing Quality Gap
Finder independently reports any recently completed escaped defect whose
receipt is missing or invalid and links the proposal back to the originating
issue. `PRODUCTION_VERIFIED_SHA` must match the receipt's deployed-build SHA;
omitting it fails closed.

## Closure receipt

Put the marker in the originating issue description or a comment. The latest
marker is authoritative. Replace every example value with real evidence; URLs,
SHAs, `TODO`, and narration are validated rather than trusted by implication.

```markdown
<!-- escaped-defect-closure:v1
{
  "schema": "jovie.escaped-defect-closure/v1",
  "originatingIssue": "JOV-1234",
  "reproduction": {
    "evidenceRef": "https://github.com/JovieInc/Jovie/actions/runs/123"
  },
  "productRepair": {
    "fixRef": "https://github.com/JovieInc/Jovie/pull/1234",
    "deployedBuild": {
      "sha": "0123456789abcdef0123456789abcdef01234567",
      "url": "https://jovie-build-jovie.vercel.app",
      "deploymentId": "dpl_exact_build_123",
      "evidenceRef": "https://github.com/JovieInc/Jovie/actions/runs/123#production-verified",
      "verifiedAt": "2026-09-29T12:00:00Z"
    },
    "journeyRetestRef": "https://github.com/JovieInc/Jovie/actions/runs/124#original-report"
  },
  "detection": {
    "originatingIssue": "JOV-1234",
    "gapClass": "missing-invariant",
    "gapAnalysis": "The previous certification checked render success but not the failed interaction outcome.",
    "detectorRef": "apps/web/tests/e2e/the-journey.spec.ts",
    "coveredClass": "the interaction outcome across every surface using this shared primitive",
    "deliberateRedRef": "https://github.com/JovieInc/Jovie/actions/runs/125#deliberate-red"
  },
  "remediation": {
    "mode": "not-automatic"
  }
}
-->
```

`gapClass` reuses the JOV-7084 detection-gap taxonomy: `missing-signal`,
`stale-signal`, `missing-join`, `bad-classification`, `missing-invariant`,
`missing-remediator`, `remediator-failed`, `false-green`,
`founder-only-surface`, or `coverage-gap`.

## Non-applicability

A detector may be non-applicable only when the receipt still explains the
detection gap and replaces `gapClass`, `detectorRef`, `coveredClass`, and
`deliberateRedRef` with all of:

```json
{
  "nonApplicability": {
    "justification": "A specific explanation of why no reusable machine detector applies.",
    "evidenceRef": "https://linear.app/jovie/issue/JOV-1234#evidence",
    "approvedBy": "Summer"
  }
}
```

Generic `n/a`, `none`, `pending`, and one-line waivers fail closed.

## Bounded automatic remediation

If no automatic repair runs, use `"mode": "not-automatic"`. If one does, the
receipt must make attempts, wall-clock time, and spend finite. It must also
preserve the terminal failure as an explicit blocked state with reason, owner,
evidence, and next action:

```json
{
  "mode": "automatic",
  "budget": {
    "maxAttempts": 3,
    "wallClockMs": 600000,
    "maxSpendUsd": 5
  },
  "exhaustion": {
    "state": "blocked",
    "reason": "retry budget exhausted after three failed repairs",
    "owner": "Summer",
    "evidenceRef": "https://github.com/JovieInc/Jovie/actions/runs/126",
    "nextAction": "route the receipt to the owning repair issue"
  }
}
```

The attempt ceiling is three, matching the adopted No Unattended Red contract.
The evaluator rejects infinite time or spend and any exhaustion state that
keeps retrying or disappears.
