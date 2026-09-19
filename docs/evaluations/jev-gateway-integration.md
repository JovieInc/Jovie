# Jev evaluation integration (JOV-6465)

Decision: compose deterministic `run-outcome/v1` from PR #17944 with the
optional `jev-shadow/v1` and official AI SDK evaluation API in PR #18006.
The core never imports or calls a model and leaves `shadow: null`; this layer
reuses its pure evidence fingerprint helper. The existing executor still
owns admission, persistence, deduplication, retries and delivery. This increment
implements an explicit advisory text review, not autonomous model selection or
a production rollout.

## Supported route and compatibility

- `scripts/invariants/jev-gateway.mjs` exports `prepareJevRequest`,
  `runJevEvaluation` and `evaluateThroughGateway`.
- Script-only dependency alias `ai-evaluation` pins Apache-2.0 `ai@7.0.105`
  and its Gateway `4.0.85` dependency. Application AI SDK 6 and Eve are unchanged.
- The explicit Gateway model instance is `typesafe-ai/jev`. Gateway 4's default
  endpoint is `https://ai-gateway.vercel.sh/v4/ai/evaluation-model`.
  Do not copy the older application SDK's `/v1/ai` base URL.
- Existing `AI_GATEWAY_API_KEY` is injected through the repository Doppler
  wrapper. There is no Typesafe key, global provider override or paid fallback.
- Evaluation state is curated text. JSON/text support does not establish image
  inspection. Filenames, image hashes and descriptions cannot substitute for pixels.

The native FX tool-safety reviewer is a distinct supported integration:
`FX_REVIEW_MODEL=typesafeai/jev` (different spelling). FX 0.0.10 documents this
as a typed action-safety decision. It is not a design evaluator or a replacement
for Codex's platform approval system. No global FX settings were changed here.

Alternatives considered: native FX review fits tool safety; a ChatGPT/Codex
completion hook would create unnecessary paid calls and cannot authorize
actions; direct Typesafe HTTP duplicates credentials/transport; a new judge
service duplicates existing evidence machinery. The explicit SDK seam adds only
Jovie's artifact binding, scope, admission and rubric rules. Both AI SDK and FX
are maintained upstream; this experimental API is pinned because patch releases
can change it. Keeping plain JSON receipts and an injected transport makes exit
or replacement possible without moving the evidence store.

## Calling contract

Prepare a request containing `sourceSha` (40 hex), `artifactSha256` (64 hex),
`scope`, `stage`, `modality: 'text'`, and `state` (at most 16,000 UTF-8 bytes).
Hash the actual saved artifact bytes; the caller must verify the claimed source
revision and artifact digest against its existing manifest. The implementation
adds its own source digest and the exact rubric and route to the fingerprint.
Do not send raw private source, personal conversations or customer data.
The secret/PII screen is defense in depth, not a complete declassifier.

`runJevEvaluation(request, options)` requires:

- `approval`: matching `fingerprint`, `dataApproved`, `fundingApproved`,
  `authorityRef`, `expiresAt` within five minutes, `availableUsd`, `maxUsd`, and
  a positive `estimatedUpperBoundUsd` no greater than the authorized envelope.
  These come from the trusted operator/admission owner, never model output.
  This is an admission estimate, not a provider-enforced billing cap.
- `readCurrentFingerprint`: rereads the saved input/artifact and current policy
  to prepare the current request fingerprint before and after inference.
- `apiKey`: the existing Gateway credential; never persist it in the receipt.
- Optional `signal` and `previous`: cancellation and the durable owner's prior
  receipt. Unchanged evidence returns `unchanged` without repeating inference.

The existing owner must serialize calls for the same artifact and persist every
terminal result in its existing evidence store. This function does not create a
lock service or durable queue. Do not resubmit unchanged evidence after failure
merely to obtain green. A route/rubric/implementation correction changes the
fingerprint and warrants a separately recorded attempt.

Results include exact artifact/source/implementation hashes, request fingerprint,
scope, route, text-only evidence basis, status and, after valid inference,
alignment, timing, usage and a Gateway response ID when supplied. Raw provider
errors and arbitrary response bodies are excluded. SDK response model identity
reflects the selected Gateway instance; it is not independent backend attestation.
Unknown billed cost remains null. Timeouts, aborts, stale state and invalid output
cannot produce an evaluated result. SDK retries are zero; no fallback is used.

Persist the deterministic run outcome before requesting optional advice. For
existing run outcomes, attach the returned `.shadow` using
`attachJevShadow(outcome, evaluation.shadow)` only after `status === 'evaluated'`;
retain the full evaluation receipt alongside it. A shadow cannot set certification.
`evaluated` and `supported` are advisory results, never human certification.
The synchronous shadow classifier also turns evaluator exceptions into
`insufficient` without exposing the raw error. Optional advice cannot prevent
the deterministic result from being returned or persisted.

## Design and landing review sequence

1. Existing Pen owner saves the element and required typed responsive, theme
   and interaction variants; existing design/frontend rules remain applicable.
2. Evaluate supplied text evidence at the appropriate stage: `structure`,
   `audience`, `narrative`, `section`, `copy`, `coherence`, or `outcome`.
   Each section must identify its reader question, intended outcome, real
   supporting product proof and action. A supplied description is not visual proof.
3. A contradiction returns to the owner with the failed requirement. Missing
   proof stays insufficient; visual or taste questions require a specialist.
   Preserve valid hero variants and shared-symbol/reference ownership.
4. An independent Astra reviewer **inside Codex** inspects the saved renders and
   complete variant set. Never route Astra through Gateway.
5. Show that exact saved/rendered version in the founder conversation. Only an
   explicit human decision may certify it; edits invalidate affected evidence.

## Evidence and limits

On 2026-09-19, existing FX/Doppler credits reported $27.741510768 before the
final synthetic check on commit `bfaf5d045206d87dfeba8650c58ecdf9a14ceef9`.
These are historical observations before the functional layer separation.
One initial
request to the wrong legacy endpoint failed and was retained. After checking
the pinned provider source, the corrected `/v4/ai` request evaluated a fictional
refund-success claim against a failure receipt as `contradicted`: 858 ms,
457 input and 56 output tokens. No image/private artifact was transmitted.
The official model page lists $0.04 per million input tokens; exact billed cost
was not returned. One synthetic example is transport proof, not calibration or
an economic benchmark.

`pnpm run-outcome:check`, already called by the structural `invariants:check`
lane, exercises the outcome/shadow tests, explicit attachment and persistence
regressions, and the bounded transport
with the real pinned SDK against fake HTTP. New transport enforcement is 100%
line/function and at least 90% branch coverage. Tests do not make paid calls.

Ship now: explicit advisory pilot only. Re-evaluate when JOV-6413 representative
replay/holdout evidence proves useful quality and attributable cost. Then use
JOV-6414's existing canary/admission policy for the demonstrated scope. Full
routing hardening remains JOV-6412; design certification remains JOV-6220.

Sources: [Jev model and pricing](https://vercel.com/ai-gateway/models/jev),
[AI SDK evaluation](https://ai-sdk.dev/docs/ai-sdk-core/evaluation),
[FX reviewer configuration](https://fx.sh/docs/configure-fx/permissions),
[FX source and license](https://github.com/vercel-labs/fx).
