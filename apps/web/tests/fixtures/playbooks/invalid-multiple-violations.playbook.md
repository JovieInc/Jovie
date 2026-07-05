---
{
  "id": "invalid-multiple-violations",
  "title": "Intentionally Invalid Playbook Fixture",
  "version": "0.1.0",
  "problemStatement": "This fixture exists to prove the validator fails with named-rule errors.",
  "triggerConditions": ["never — this is a test fixture"],
  "requiredInputs": [],
  "steps": [
    {
      "kind": "tool_call",
      "tool": "tool_that_is_not_declared",
      "description": "Calls a tool missing from requiredTools (undeclared-tool-deps)"
    }
  ],
  "successMetric": {
    "name": "Vibes",
    "source": "vibes",
    "direction": "increase",
    "window": "whenever"
  },
  "evalSeeds": [
    {
      "name": "only-one-seed",
      "input": {},
      "expected": "Fewer than the minimum seeds (missing-eval-seeds)"
    }
  ],
  "costEstimate": { "credits": 0 },
  "requiredTools": [],
  "requiredConnectors": [],
  "requiredEntitlements": []
}
---

# Intentionally Invalid Playbook Fixture

Lives under `tests/fixtures/` (not `docs/playbooks/`) so the CI validator's
real sweep never sees it. Covered by
`tests/unit/lib/playbooks/schema.test.ts`.
