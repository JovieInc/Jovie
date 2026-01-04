# Testing Guidelines

These guidelines set a YC-style standard for fast, confident shipping. Favor the smallest test that proves the behavior, and keep feedback loops tight so builders can move quickly without sacrificing reliability.

## Principles

- **Ship fast, stay correct:** Tests are a safety net, not a brake. Write the minimum set that lets you ship with conviction.
- **Test behavior, not implementation:** Assert observable outcomes and contracts rather than internal wiring.
- **Make failures obvious:** Tests should fail loudly and point to the decision that broke.
- **Keep feedback loops short:** Prefer unit and integration tests that run in seconds; reserve E2E for golden paths.
- **Own the surface you change:** Every new flow or fix deserves coverage at the smallest layer that can prevent regressions.

## When to Use Each Test Type

| Test Type | Use It When | Avoid It When |
| --- | --- | --- |
| **Unit** | Pure logic, utilities, guards, mappers. Fast feedback on contract changes. | Behavior crosses process boundaries or requires heavy mocking. |
| **Integration** | Data access, API handlers, server actions, feature-flagged logic, auth gates. Validate real wiring and side effects. | The system surface is simple enough for a unit test or the setup becomes brittle. |
| **End-to-End (E2E)** | Golden paths: sign-in/onboarding, profile publish/share, monetization flows. Prove user journeys and key redirects. | Chasing edge cases better covered by integration tests or flaky browser timing. |
| **Contract** | Third-party integrations (Clerk, Neon, Statsig), API schemas, webhook payloads. Ensure compatibility over time. | When you fully control both sides of the interface. |
| **Snapshot/Visual** | UI components where visual regressions matter (icons, typography, spacing, themes). | Dynamic content or behavior-driven flows that change often. |
| **Performance** | Pages or APIs with latency/throughput targets. Guard budgets before launch. | Premature optimization without defined budgets or baselines. |

## Examples of Good vs. Bad Tests

| Context | Good | Bad |
| --- | --- | --- |
| Auth gate | Verifies redirect target per user state using realistic session fixtures. | Asserts internal helper calls or mocks Clerk so tightly that real redirects are untested. |
| API handler | Exercises handler with real validation + database test client, asserts status code and payload. | Stubs every dependency and only checks that a function was called. |
| React component | Renders with minimal props, asserts user-visible text and critical aria attributes. | Snapshotting dynamic data without intent, causing noisy churn. |
| Feature flag | Checks gated branch behavior with gate on/off, covering fallback defaults. | Only tests the happy path with the flag enabled. |
| Performance budget | Measures response time against a threshold and fails fast when exceeded. | Lacks a budget or simply logs metrics without assertions. |

## Writing Great Tests

- Prefer **fixtures over mocks**; when mocking, mock contracts, not internals.
- Use **intent-revealing names** and keep one assertion theme per test.
- Make setups **deterministic**: seeded data, fixed clocks, and stable ids.
- **Fail fast** on missing preconditions instead of swallowing errors.
- Keep tests **independent**; avoid global state and cross-test coupling.
- **Document reasoning** when skipping tests and add a TODO with an owner to unskip.

## PR Review Checklist for Tests

- [ ] Does each change add or update the smallest test that would have caught the bug or validates the new behavior?
- [ ] Are assertions behavior-focused and resilient to internal refactors?
- [ ] Are mocks limited to contracts and free of brittle implementation details?
- [ ] Do tests cover both flag-on and flag-off branches when feature flags are involved?
- [ ] Are accessibility expectations asserted where user-facing UI changed?
- [ ] Are performance budgets defined and enforced when claims about speed are made?
- [ ] Do tests run quickly (seconds for units/integration) and avoid flakiness patterns?
- [ ] Is test data seeded and isolated, with cleanup handled automatically?
- [ ] Are skipped tests justified with a clear TODO and owner?

## Adoption Playbook

- Start new work by deciding the **minimum viable test surface** (unit vs. integration vs. E2E).
- When touching a critical path, **add an integration test first**, then augment with E2E only if user journeys are under-covered.
- For regressions, **write the failing test before the fix** to lock the behavior.
- Keep **test utilities DRY** but approachable—prefer readable fixtures over deep helper stacks.
- Treat **lint/typecheck warnings in tests as bugs**; fix them before merging.
