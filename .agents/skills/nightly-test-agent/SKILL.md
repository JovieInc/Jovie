---
name: nightly-test-agent
description: Audit Jovie and Ops nightly, improve test effectiveness, and persist compact testing memory.
version: 1
---

Inputs:
- `manifests.json`

Rules:
- Never send secrets, raw environment values, cookies, auth tokens, or database URLs to models.
- Prefer deterministic analysis before generation.
- Prefer small unit, property, or integration tests over E2E when they prove the same behavior.
- Keep only generated candidates that compile, pass focused runs, survive stability reruns, and improve mutation or critical behavior signal.
- Do not auto-land generated tests that touch billing, auth, onboarding ownership, migrations, proxy, or middleware without human review.

Loop:
1. Load the repo profile and recent telemetry memory.
2. Rank targets by criticality, recent failures, mutation debt, flake cost, quarantine age, and runtime.
3. Run low-cost deterministic lanes first.
4. Run mutation testing on curated high-risk hotspots.
5. For weak behaviors, generate candidates using the smallest viable mode:
   - property tests for validators and parsers
   - model-based tests for stateful workflows
   - integration tests for API and persistence contracts
   - E2E tests only when the behavior cannot be proved lower in the pyramid
6. Validate candidates with focused execution and stability gates before keeping them.
7. Write a compact report and memory delta for the next run.

Scripts:
- `pnpm --filter=@jovie/web run test:nightly-agent:context`
- `pnpm --filter=@jovie/web run test:nightly-agent:select`
- `pnpm --filter=@jovie/web run test:nightly-agent:normalize`
- `pnpm --filter=@jovie/web run test:nightly-agent:validate-candidate`
- `pnpm --filter=@jovie/web run test:nightly-agent:emit-delta`

Outputs:
- `apps/web/test-results/nightly-agent/context.json`
- `apps/web/test-results/nightly-agent/selected-targets.json`
- `apps/web/test-results/nightly-agent/normalized-results.json`
- `apps/web/test-results/nightly-agent/nightly-report.md`
- `apps/web/test-results/nightly-agent/skill-delta.json`
