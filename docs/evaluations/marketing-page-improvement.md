# Marketing page improvement and semantic review

Status: source implementation verified locally on September 20, 2026. No production activation or live calibration is asserted.

## Decision and ownership

**Extend and compose** the existing marketing generation contracts, Jev Gateway evaluator, Design Lab artifact tree, and marketing certification store. This work does not introduce a scheduler, model transport, certification registry, or commercial experiment engine.

The differentiating requirement is Jovie-specific authority: candidate payloads must stay within a frozen scope, claim evidence must match reviewed copy, and visual review, founder taste, and commercial outcomes retain separate evidence requirements. Generic evaluation APIs do not supply those product contracts.

The Gateway dependency is reused from JOV-6465 / PR #18006 at `0bd26aea16b10ee4403dc0c25fe03e4f7489aa74`. Existing AI SDK 7.0.105 evaluation transport, bounded admission, zero retries, and no fallback remain the substrate. The fixed marketing questions extend its rubric allowlist. See [the Gateway integration](jev-gateway-integration.md).

Provider documentation checked on September 20, 2026: [Vercel evaluation](https://vercel.com/docs/ai-gateway/modalities/evaluation) and [TypeSafe models](https://docs.typesafe.ai/models). No second SDK, external service, data store, or operational owner is adopted. Revisit this boundary if the existing adapter cannot express an independently calibrated check or supply the required evidence provenance.

## Implementation boundaries

- `apps/web/data/marketing/decision*.ts`: immutable context and incumbent, content digests, actual payload mutation checks, protected acceptance before preference, and dependent evidence invalidation.
- `apps/web/data/marketing/improvement*.ts`: bounded candidate generation and repair, conservative incumbent retention, separate semantic/taste/commercial records, and explicit stop reasons.
- `apps/web/data/marketing/semanticReview*.ts`: claim support, section overlap, and CTA expectation review through the existing Gateway adapter. Cheap deterministic failures precede model work. Missing, stale, malformed, or unavailable evidence cannot produce a positive review.
- `apps/web/lib/agent-os/design-lab/decision-review.ts`: composition with existing Design Lab proposals and durable review artifacts. The artifact is a review handoff, not a page certificate or permission to dispatch or publish.
- `apps/web/lib/agent-os/visual-review-trust.ts`, `certification.ts`, and `certification-adapter.ts`: exact candidate and independent reviewer identity requirements for marketing visual evidence. Trusted producers still own receipt provenance; a declared identity is not a cryptographic attestation.

Acceptance for composition always requires subsequent integrated page and journey verification. An approved semantic result cannot replace rendered pixel inspection, responsive/accessibility evidence, founder taste, or a customer outcome receipt.

## Calibration and activation

Synthetic development and held-out fixtures are explicitly labeled under `apps/web/tests/fixtures/marketing/`. They exercise policy behavior, not measured Jev accuracy. Never report their expected labels or mocked answers as live calibration.

JOV-6476 owns held-out writing calibration; JOV-6478 owns exact rendered marketing/UI commissioning. Required Jev semantic gates remain disabled until the existing promotion and calibration requirements are met. A live call must use the adapter's exact request-bound funding/data admission and fresh evidence readback.

JOV-1879 owns acquisition learning policy, JOV-5243 owns outcome/cost receipts, JOV-2967 owns the run-learning compiler, and JOV-6468 remains the single commercial pilot. This implementation does not initiate a competing experiment. Unknown or immature commercial evidence remains unknown; a model preference or founder choice does not establish uplift.

## Verification

Run `pnpm marketing-improvement:check` from the repository root after setup. This runs the existing adapter coverage checks and the focused web suites with V8 coverage.

The web tests use the repository's real Vitest configuration (`vitest.config.mts`, also used by `test:fast`). Their product paths participate in the existing exact-head changed-line coverage gate. The inherited `run-outcome:check` command enforces coverage on the Gateway/outcome boundary through `invariants:check`.

Record final local test counts, coverage, typecheck, and limits in the implementation receipt. Keep local source/test evidence separate from hosted CI, native merge queue, deployed build, rendered evidence, and observed customer outcomes.

## Offline review packet

Use the existing Design Lab adapter through the file-based CLI:

```sh
NODE_OPTIONS=--conditions=react-server pnpm --filter @jovie/web exec tsx scripts/design-lab-decision-review.ts --input=/absolute/request.json
NODE_OPTIONS=--conditions=react-server pnpm --filter @jovie/web exec tsx scripts/design-lab-decision-review.ts --read=REVIEW_ID
```

The request follows `PrepareDesignLabDecisionReviewParams`. It supplies two to four existing proposals, exact frozen context/incumbent evidence, protected checks, and three candidate-bound semantic inputs per proposal. JSON file mode cannot supply a trusted execution callback, so it remains offline and advisory. The persisted review artifact retains explicit certification, publication, and dispatch states. Matching requests reuse a validated artifact; conflicting evidence requires a new review ID.

### Local verification receipt — September 20, 2026

- `pnpm marketing-improvement:check`: 133 web tests and 45 inherited adapter/outcome tests passed. The CLI subprocess creates and reads an actual persisted packet.
- Focused web-module coverage: 91.34% lines, 81.82% branches, 95.82% functions. Gateway coverage: 100% lines, 92.05% branches. These figures are scoped, not repository-wide coverage.
- `pnpm typecheck`: all 13 package tasks passed.
- `pnpm typecheck:scripts`: no new errors; 141 existing errors match the repository baseline.
- Scoped Biome and `git diff --check`: passed.

The source work remains local. Hosted CI, merge, deployment, live Jev calibration, pixel review, founder approval, and commercial uplift are not established by this receipt.
