# Faster design-system certification

Reviewed 2026-11-13 (America/Los_Angeles). Scope: certification throughput;
existing correctness, accessibility, mutation, visual and journey requirements
remain authoritative. This is a recommendation and local verification receipt,
not a live model evaluation or a design certificate. No Linear issue — ad-hoc;
`gbrain-unavailable`, so ownership and prior decisions come from repository evidence.

## Use the existing System One paths

| Work | Existing implementation | Evidence boundary |
| --- | --- | --- |
| Claim/evidence alignment and typed state coverage | `scripts/invariants/jev-gateway.mjs`, `jev-shadow.mjs` | Jev is text-only; supplied screenshot descriptions cannot prove pixels. |
| Rendered screenshot rules | `scripts/invariants/clef-screenshot-evaluator.mjs` | Clef accepts pixels and emits advisory rule probabilities; deterministic certification still owns the outcome. |
| Failed certification/CI job triage | `scripts/invariants/jev-ci-failure-triage.mjs` | Bounded labels with abstention; the existing repair ladder owns actions. |
| Classifier-first dispatch | `apps/web/scripts/design-ci-judge-dispatch.ts` | Borderline results escalate to a different model family; unavailable judges stay insufficient. |

Prefer these paths over a second model service, transport, credential store or
queue. Retain the exact artifact/source/rubric fingerprint, deduplication,
timeout, budget admission and insufficient-evidence behavior documented in the
[Jev integration](../evaluations/jev-gateway-integration.md). Keep the
[Clef evaluator](../evaluations/clef-screenshot-evaluator.md) advisory, and
do not transfer its fitted thresholds to another model.

Current execution environment: `AI_GATEWAY_API_KEY`,
`CLOUDFLARE_WORKERS_AI_TOKEN`, `GOOGLE_API_KEY` and `GEMINI_API_KEY` are absent.
The existing resolver also found no saved Wrangler OAuth credential when called
with refresh disabled. Only credential presence was inspected; no credential
values were logged or model requests sent.

There is a separate caller gap: `buildLiveJudges()` constructs `jevCheapJudge()`
without its optional `approve` callback. Supplying a key alone therefore still
leaves that path `not-admitted`. Connect the existing trusted admission owner
and persist receipts before claiming live execution. Do not invent an approval
or a spending envelope in the dispatcher to make the status green.

## Google Decisions and Stitch

Google announced the **Gemini Decisions API** on November 11, 2026, with
`gemini-decision-1`. It supports multimodal input and up to 1,000 typed questions;
Google reports 150–250 ms end-to-end latency for its benchmark conditions. That
is a provider claim, not a Jovie measurement. Google also identifies Stitch's
Rapid canvas experiment as a consumer of this API.
[Source: Google announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/).

The documented REST route is
`https://generativelanguage.googleapis.com/v1beta/decisions`. The request uses
`input`, with `noul`, `choice` and `score` questions; answers carry probabilities.
Its shared input format differs from System One's `state`, so an endpoint-only
swap would be incorrect. An adapter must validate answer types and preserve
explicit abstention. SDK/API versions and account eligibility need checking at
implementation time.
[Source: Decisions API documentation](https://aistudio.google.com/docs/decisions-api).

Use Stitch Rapid to explore missing interaction states or alternative flows,
then implement selected changes in the canonical component and Storybook
sources. Generated wireframes are candidate designs: the existing state matrix,
accessibility, journey, mutation and screenshot checks still run against the
implementation. The Rapid URL could not be inspected by the web reader in this
session; no Stitch project, API integration or generated design was exercised.

**Ship now:** retain Jev for curated text, Clef for screenshot advice, and the
current deterministic gates. Prepare a disabled Gemini comparison through
`packages/api-client`, using the same immutable screenshot/text corpus and
answer schema, once a credential and bounded admission are available.

**Re-evaluate when:** a held-out corpus covers the required responsive, theme,
interaction and failure states, with independent labels; every candidate run
records per-rule false passes/misses, abstention, actual cost, p50/p95/n latency,
and total wall time from capture through repair. Evaluate bundled questions
against isolated questions to catch changed decisions. Proposed acceptance
targets must be agreed by the existing policy owner; this document promotes
no new thresholds.

**Then:** select the route that improves end-to-end certification throughput
without worsening the required defect detection. Keep a different model family
for ambiguous cases and a reversible route switch. Provider confidence alone
cannot promote a design certificate.

Clef remains a viable comparison baseline: Cloudflare documents image input and
System One-compatible typed decisions. The current Jovie screenshot replay is
small and in-sample, as its evaluation document already states.
[Source: Cloudflare Clef documentation](https://developers.cloudflare.com/workers-ai/models/clef/).

## Parallel work that compounds

1. Inventory and hash source/test/story inputs once per run. Reuse immutable
   analysis across criteria; invalidate it when any consumed bytes change.
2. Build Storybook once for the exact revision, then give bounded browser
   workers disjoint component/state slices. Each slice must preserve themes,
   viewports, interaction states and complete failure reporting.
3. Run independent static, coverage, mutation and rendered producers in
   parallel. Join by exact revision and producer fingerprint; a missing or stale
   slice stays unknown. Cache proven artifacts rather than skipping checks.
4. Reuse each screenshot for deterministic geometry/accessibility checks and
   model advice. Group only independent questions about the same capture, and
   retain a per-question result so a strong score cannot compensate for a miss.
5. Dispatch remediation from the first concrete defect while independent
   producers finish. Re-run affected producers after the fix, then require the
   complete final revision evidence set before calling the component certified.

These are implementation opportunities, not measured improvements. New
pipeline stages must follow [the stage event contract](../metrics/STAGE_EVENTS.md)
and report end-to-end timings; faster inference alone does not prove a faster
certification process.

## Verification in this session

Rechecked after refreshing the checkout to current main,
`f49eba8f9d676ff24ec6fa36035e2f9862ddcfbb`, with Node 24.22.1. The Jev route,
credential resolvers and `buildLiveJudges()` admission gap above are unchanged:

```sh
node --test scripts/invariants/jev-gateway.test.mjs \
  scripts/invariants/jev-shadow.test.mjs \
  scripts/invariants/jev-shadow-integration.test.mjs \
  scripts/invariants/jev-ci-failure-triage.test.mjs \
  scripts/invariants/clef-screenshot-evaluator.test.mjs
pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts \
  scripts/design-ci-judge-dispatch.test.ts \
  scripts/design-ci-judge-router-evaluation.test.ts
```

Results: 58 Node tests passed (491 ms test-runner duration); 29 dispatcher/router
tests passed (834 ms Vitest duration). Tests use injected transports/fixtures,
including the pinned SDK against fake HTTP. They prove local mechanism and
fail-closed behavior, not live transport, provider latency or certification.
Official provider documentation was read separately. Stripe Directory tooling
was unavailable; its setup documentation was checked before primary-source
provider research. No provider was provisioned and no paid call was made.

The browser tracker directory also contains a runnable offline System One
preflight panel:

| Session artifact in `/workspace/ds-certification-tracker` | Contents |
| --- | --- |
| `system-one-source-report.json` | Fresh deterministic report for AmountSelector, FooterBranding and SeekBar, at the full revision above. |
| `system-one-panel.json` | Eight known-status smoke cases: raw tokens, forced casing, missing state stories, missing test, missing input-retention test, unknown mutation evidence, an unsupported pixel claim and a supported failure-report claim. |
| `system-one-requests.json` | Eight requests prepared by the existing `prepareJevRequest`, each bound to the report-derived panel digest and exact source revision. Expected labels are excluded from model input. |
| `system-one-not-run.json` | Existing `runPreparedJevEvaluation` returned `not-admitted` for every request; an injected transport counter stayed zero. Overall model status is `not-run`. |

Each selected component's source digest was verified against both the worktree
and Git's full revision before panel preparation. The panel SHA-256 is
`97ea858c136afb13b512af0cf204516aff0fb28f5ec444bfded29715d0bc6d47`.
This is a smoke panel with deterministic expected labels, not a held-out
calibration set or a claim that a model detected these failures.

The minimum live adapter already exists: prepare the bounded request with
`prepareJevRequest`, then call `runPreparedJevEvaluation` with the trusted
owner's request-bound admission, credential and a callback that re-reads the
actual artifact/source fingerprint. Persist its full receipt alongside the
deterministic report. The offline panel exercised that same path without
admission and proved it dispatched no model call. Recheck source and artifact
digests and prepare fresh requests before live use; stale session artifacts
must not be promoted. A second CLI or transport is unnecessary.
