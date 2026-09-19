# Profile completeness evaluator

The shared `@jovie/jev-evaluation/server` package extracts the existing guarded
Gateway implementation; it does not add a provider, migrate web's AI SDK 6, or
activate any job. The package privately pins the existing AI SDK 7 alias. Web
imports the `server-only` entrypoint at `lib/jev/profile-completeness.server.ts`.
The existing scripts integration can reexport this package after it lands. Runtime code uses no
filesystem reads. The implementation digest is generated with `pnpm --filter @jovie/jev-evaluation generate` and checked by
`pnpm --filter @jovie/jev-evaluation test` in the existing web structural CI lane. Any changed implementation invalidates old
request fingerprints. TypeScript reads the authoritative JSDoc source directly
through the workspace's existing allowJs support; there are no duplicate generated
declaration files to drift. The package separately runs checkJs type validation.

Adoption decision: compose the existing Gateway evaluator and pnpm workspace
boundary. No new provider, queue, runtime service or broad SDK migration is needed.
Only alignment/completeness transport is extracted with its regression tests.
The separate UI Choice and certification-shadow APIs remain in their original
scripts workstream; they are not requirements of this product boundary. Script compatibility
updates remain with the older scripts PR owner after this package lands.

## Contract and ownership

The shared eligibility owner supplies canonical snapshot JSON, SHA256, canonical
profile UUID, policy `profile-completeness/v1`, and trusted deterministic boolean
checks for identity, photo, content, destinations and provenance. The adapter
verifies the exact byte digest and profile identity and binds all evidence, checks,
policy and source revision into the admitted request fingerprint. Input text is
bounded and screened, including decoded JSON strings. All checks must pass before
transport can run. The caller must reread the current fingerprint before and after
transport; a constant callback is only appropriate for immutable test fixtures.

The result contains schemaVersion, profileId, snapshotSha256, policyVersion,
evaluatedAt, model, transportStatus, verdict, deterministic reasons and confidence.
Only `evaluated` contains a timestamp and supported/contradicted/insufficient
verdict. `needs-specialist` maps to insufficient. Numeric confidence is null;
Jev does not expose a calibrated confidence in this contract. Provider errors
never leak raw responses. Existing data/funding admission, deadline, zero retries,
exact route, model identity and stale-evidence checks remain required.

The result is not ownership proof, directory eligibility, or outreach authority.
The shared gate owns mandatory-field validation, score, current revision/policy
checks, no-future timestamp validation, <=24 hours freshness, trusted persistence and
invalidation. User-editable settings must never certify a receipt. Missing or stale
receipts fail closed. The evaluator does not read secrets or dispatch jobs by itself.

## Synthetic policy calibration

Proposed policy: five mandatory categories each contribute 20 points; require 100
plus an evaluated supported receipt. This threshold is a deterministic all-required
policy, not an empirically calibrated model score or a threshold chosen by Tim.
Lowering the threshold cannot allow a failed mandatory check. Quality beyond
mandatory completeness requires additional held-out examples before tightening
policy. These fixtures use only synthetic profile text and example.com destinations.

| Fixture | Checks / score | Simulated Jev result | Expected decision |
| --- | --- | --- | --- |
| Complete synthetic songwriter | all /100 | supported | Judgment may satisfy model gate; shared gate still checks freshness/revision |
| Missing photo | photo false /80 | even supported if called | Do not call model; missing_photo; ineligible |
| Missing identity, bio, destination or provenance | one false /80 | even supported if called | Do not call model; corresponding missing reason; ineligible |
| Complete fields with conflicting evidence | all /100 | contradicted | Evaluated failure; ineligible |
| Complete fields with ambiguous evidence | all /100 | insufficient | Abstain; ineligible |
| Evidence requires actual pixel inspection | all /100 | needs-specialist | Insufficient; no visual certification |
| Profile edited during evaluation | all /100 | supported | Stale, no verdict; ineligible |
| Missing admission or duplicate request | all /100 | none | Not evaluated, no verdict; ineligible |
| Provider error or invalid model response | all /100 | unavailable | Failed, no verdict; ineligible |

The fixtures exercise mechanics and expected policy decisions with injected model
responses. They do not establish live Jev accuracy, false-positive rates, image
quality or operational certification. Jev receives curated text only; an image URL
is not evidence of pixel inspection. Live evaluation remains blocked by the
existing platform approval denial. No model request, spending or outreach occurs
in these tests.

Ship now: the bounded server import and fail-closed contract after required checks.
Re-evaluate when: authorized live public/synthetic evaluations or field requirements
change. Then: record held-out expected vs observed decisions and revise the policy
version through the existing shared eligibility owner; never rewrite a prior pass.
