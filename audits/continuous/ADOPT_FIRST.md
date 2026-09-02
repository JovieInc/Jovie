# Continuous audit adopt-first decision

## Decision

**Compose and extend.** Jovie already has the expensive execution pieces. Add a
small local registry and validator that makes their coverage, evidence, model
eligibility, deduplication, and resolution lifecycle explicit. Do not add a new
service, database, policy daemon, or scheduler.

The differentiating requirement is Jovie's proof ladder and acceptance loop:
source, CI, native queue, deployment, and exact runtime must remain separate;
model claims require direct evidence; every finding must end fixed, disproven,
deferred with an expiry, or blocked. None of the evaluated substrates provides
that Jovie-specific control contract end to end.

## Existing Jovie substrates retained

| Need | Existing substrate | Decision |
|---|---|---|
| Risk-ranked deterministic test selection | Nightly Testing Agent and `TEST_RISK_REGISTER.md` | Extend through coverage partitions; do not replace. |
| Multi-model review recipes | QA swarm and model registry | Reuse only after per-run provider qualification. |
| LLM behavior comparison | Promptfoo deterministic and manual live lanes | Reuse for model/eval families; preserve manual live gates and concurrency 1. |
| Finding fingerprints | Observability fingerprint pipeline | Reuse its stable-fingerprint pattern; keep audit lifecycle local until a finding is validated. |
| Durable invariants | `canon/invariants.jsonl` and invariant stewardship | Promote only validated accepted findings into tests, metrics, or receipts. |
| CI and queue evidence | CI duration ratchet, merge-queue backend, delivery receipts | Compose as direct evidence; never treat a green source run as queue/deploy/runtime proof. |
| Production evidence | Production Controller and immutable post-deploy probes | Read only; audit orchestration gains no production mutation authority. |
| Security and supply chain | Gitleaks, TruffleHog, SonarCloud, Dependabot, Scorecard docs | Keep as family probes. |

## Maintained external substrates checked

Research was refreshed on 2026-09-02 from the projects' official GitHub
repositories and READMEs.

| Substrate | Maintenance and license signal | Fit | Decision |
|---|---|---|---|
| OpenSSF Scorecard | Active repository, Apache-2.0; exposes structured security-health checks and explicitly warns that aggregate scores are heuristic | Good security-family probe, not a whole-system finding lifecycle | Adopt existing/official probe where already configured; do not use its aggregate score as policy. |
| OSV-Scanner | Active Google repository, Apache-2.0; supports JavaScript lockfiles, offline databases, and documents exactly what package metadata leaves the machine | Strong dependency vulnerability probe with an offline privacy mode | Candidate family probe only. Installation or scheduled use still requires a separate dependency/automation decision. |
| Open Policy Agent | Active CNCF-graduated project, Apache-2.0; general-purpose policy engine | Technically capable but adds a language/runtime and policy service for a JSON-validation bottleneck | Reject now. Revisit only when three or more independent consumers need the same live policy decision API. |
| SARIF | OASIS standard for aggregating static-analysis results | Useful interoperability vocabulary and fingerprints; does not model Jovie's proof tiers or resolution expiry | Compose selected concepts, not the full format as the canonical store. Export later only if a code-scanning consumer requires it. |
| Promptfoo | Active MIT project; local eval execution, provider comparison, CI integration | Already pinned in Jovie and fits model disagreement experiments | Extend existing deterministic/manual lanes. Do not add scheduled live-model spend. |

## Privacy, cost, and exit boundary

- Registry validation is local Node.js with no new dependency and no network.
- Deterministic probes run first. Model runs receive only the selected sanitized
  partition, never secrets or customer data.
- Every provider requires a fresh qualification receipt. Hyperagent is
  unqualified and fails closed; another provider is never substituted silently.
- Default model spend is zero cents. A family can consume subscription-included
  capacity only after its explicit per-run cap and qualification pass.
- Registry and results are plain JSON. Jovie can export SARIF or move execution
  providers without migrating a service or database.

## Revisit triggers

- Adopt OPA only if at least three runtime consumers need identical policy
  decisions and the local validator becomes the measured bottleneck.
- Add OSV-Scanner only after its exact binary/action pin, offline database
  refresh path, and CI runtime budget are approved.
- Add a SARIF export only when GitHub code scanning or another accepted consumer
  needs it.
