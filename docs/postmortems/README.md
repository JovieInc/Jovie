# Post-mortems

Every failure an agent resolves becomes learning that compounds. A post-mortem
fixes more than the instance: it names the **failure class** (the missing
invariant, instrumentation, or guardrail), then puts a control in place
everywhere that class can occur. Agents write, review, and close post-mortems.
Tim is never required.

## Index

| Date | Incident | Failure classes | Status |
| --- | --- | --- | --- |
| 2026-10-02 | [PR recovery stopped converging](2026-10-02-pr-recovery-stall.md) | `non-convergent-control-loop`, `pre-merge-parity-gap` | draft |
| 2026-09-28 | [Codex lane dispatch and attribution gap](2026-09-28-codex-lane-attribution-gap.md) | `green-by-implication`, `evidence-forgery-or-staleness` | draft |
| 2026-09-27 | [Production freeze: SBOM step failed every promotion after #18879](2026-09-27-sbom-provenance-freeze.md) | `pre-merge-parity-gap`, `silent-production-staleness`, `green-by-implication` | draft |
| 2026-09-26 | [Production freeze: jov.ie stuck on `eb15ae0` for five days](2026-09-26-production-freeze.md) | `silent-production-staleness`, `pre-merge-parity-gap`, `serial-layer-discovery`, `non-convergent-control-loop`, `green-by-implication`, `privileged-recovery-only`, `unowned-incident` | reviewed |
| 2026-07 | [CI/release drain: incident prevention and inheritance](2026-07-ci-release-drain.md) | see the [39-incident CI/release index](../ci/CI_RELEASE_INCIDENTS.md) and [machine ledger](../../.github/ci-harness/ci-release-incidents.json) | contract |

## When a post-mortem is required

Write one for any of these events:

1. **Production.** jov.ie or another production surface is down or degraded,
   rolled back, or serving a commit more than 2 hours behind deploy-relevant
   `main` (freeze).
2. **Red main.** A required check on `main` stays red for more than 60 minutes.
3. **Stall.** A shipping lane, the merge queue, Symphony, Summer, or an agent
   fleet makes no progress for more than 4 hours.
4. **Security or data.** Leaked secret, cross-tenant access, data loss or
   corruption, or a migration that damaged production data.
5. **Escaped defect.** A P0/P1 bug found by a user, customer, or post-ship
   walkthrough that a machine check could have caught.
6. **Systemic fix.** An agent fix for a failure that recurred, blocked other
   work, or needed more than one attempt.

A single flaky rerun or a PR's own red CI does not need one.

## Trigger: event hooks, not memory

The Linear `incident` label is the trigger record. Monitors open it, and any
agent that sees a trigger event opens it if none exists:

- The production freshness and continuity monitor (JOV-6684) opens an
  `incident` issue idempotently when production lags `main` or goes down.
- Sentry P0 autofix, Production Controller health, and Summer's bottleneck
  loop open or link one for the events above.
- **Closure gate.** An `incident` issue cannot close until a post-mortem file
  exists on `main`. The closing PR adds or links `docs/postmortems/*.md`, and
  CI enforces this (`scripts/postmortem-linkage-check.mjs`, JOV-6689): warn
  until `blockingAfter` in `.github/postmortem-linkage-policy.json`, then
  blocking. Summer keeps enforcing it in review (JOV-6690).

The agent that lands the recovering fix writes the post-mortem within 24 hours
of recovery. It goes in the fix PR or in a follow-up docs PR. If that agent's
session ended, Summer assigns the write-up.

## Where post-mortems live

- **Canonical:** `docs/postmortems/YYYY-MM-DD-<slug>.md` in this repo. The repo
  is the one place every agent can read (any checkout, any model, offline) and
  every human can read on GitHub. It is reviewed like code, and CI can lint it.
- **Mirror:** company GBrain page `ops/postmortems/<YYYY-MM-DD-slug>` for
  semantic recall by agents that query the brain before acting. The author
  writes the mirror; Summer repairs it if missing. On any conflict, the repo
  file wins.
- **Actions:** Linear issues labeled `postmortem-action`, one per systemic
  control, linked from the post-mortem's action table.
- CI/release failure modes that have an executable verifier are also recorded
  in the [CI/release incident ledger](../ci/CI_RELEASE_INCIDENTS.md) once the
  verifier lands.

## Template

Copy [TEMPLATE.md](TEMPLATE.md). Required sections: summary, impact (time to
detect, time to own, time to repair, what was blocked), timeline, root cause,
contributing causes, **failure classes and invariants violated**, why
detection failed, the instance fix, **systemic controls** applied to every
similar surface, action items as Linear issues, and open questions. Mark every
claim you could not verify from source as `unverified`.

The frontmatter is machine-read by the pattern review and the lint in
JOV-6689:

```yaml
---
id: 2026-09-26-production-freeze
status: draft | reviewed | controls-verified | closed
severity: sev1 | sev2 | sev3
detected: 2026-09-23T21:37Z
repaired: 2026-09-26T22:45Z
failure_classes: [silent-production-staleness]
incident_issue: JOV-XXXX | none
actions: [JOV-XXXX]
gbrain: ops/postmortems/2026-09-26-production-freeze
---
```

## Failure-class taxonomy

Reuse an existing class before inventing a new one. The pattern review counts
by these ids.

| Class | Meaning |
| --- | --- |
| `silent-production-staleness` | Production stopped advancing and nothing alerted. |
| `pre-merge-parity-gap` | A pre-merge gate does not exercise the path that failed after merge (packaging, deploy, runtime env). |
| `serial-layer-discovery` | Stacked defects surfaced one per attempt because the failing stage reported only the first error. |
| `non-convergent-control-loop` | A controller or pipeline cannot reach its goal under normal load (livelock, starvation, retry storm). |
| `green-by-implication` | A skipped, superseded, or partial run rendered as success. |
| `privileged-recovery-only` | Recovery needed a human-only permission; no sanctioned agent path existed. |
| `unowned-incident` | No single incident record or owner, so parallel partial fixes. |
| `escaped-defect` | A user-visible bug reached production that a deterministic check could have caught. |
| `unbounded-operation` | Missing timeout, retry cap, or size bound. |
| `evidence-forgery-or-staleness` | A gate accepted evidence that was fabricated, stale, or about the wrong head. |

## Review loop (Summer)

Summer, the governor agent, owns the loop (JOV-6690). It is part of Summer's
improvement loop and bottleneck ranking (JOV-5817).

1. **Review on merge.** Check the post-mortem against the template. Confirm
   each systemic control has a `postmortem-action` issue, and file any that is
   missing. Confirm the GBrain mirror. Set `status: reviewed`.
2. **Class, not instance.** A control that protects only the one file or
   workflow that failed is incomplete. The action must name every similar
   surface it covers, or state why none exist.
3. **Weekly pattern review.** Group all post-mortems by `failure_classes`. A
   class seen twice or more gets one class-level hardening issue, linked from
   each post-mortem. Report counts and time-to-detect trends in the
   improvement loop.
   The [quality gap finder](../quality/QUALITY_GAP_FINDER.md) re-checks every
   class on each post-mortem merge. It proposes a guardrail when no invariant,
   ledger entry, or script names the class and its actions have closed.
4. **Closure needs live proof.** An action closes only when its control is
   **verified live**, meaning the alert fired, the gate rejected a deliberate
   red fixture, or the invariant test failed on the old code. Merging the
   change is not enough. The action row records the receipt. The post-mortem
   moves to `controls-verified`, then `closed`.

## Keep it light

A post-mortem is one file, written by the agent that fixed the problem, in the
fix PR or right after it. Blameless: name systems, PRs, and missing controls,
never people or agents as the cause. Write it in the same session, while the
facts are fresh. Reconstructing facts later is the expensive part.
