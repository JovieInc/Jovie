---
name: qa
description: >
  QA Jovie with in-repo Playwright. Use when asked to qa, test the site,
  find bugs, verify a deployment, or dogfood a user flow.
---

# QA (Playwright)

Do not use `/browse`, `$B`, or the gstack browse daemon. That path is removed.

The fastest agent web tool in this repo is Playwright Test:

```bash
pnpm --filter @jovie/web exec playwright test <spec> --project=chromium --reporter=line
```

Playwright MCP is allowed when the session has it attached. Otherwise use `pnpm exec playwright`.

## Auth

Use Clerk Playwright helpers and the local test-auth bypass. See `.claude/rules/auth.md`.

- Loopback: `E2E_USE_TEST_AUTH_BYPASS=1` and `/api/dev/test-auth/enter?persona=creator-ready&redirect=/app`
- Do not prompt for credentials. Do not import cookies into a browse daemon.

## Workflow

1. Find or add a Playwright spec under `apps/web/tests/e2e/` for the flow.
2. Run the narrowest spec. Do not boot a gstack daemon.
3. If a bug is real, fix the product code and keep the spec.
4. Interactive dogfood uses the same Playwright runner, not `$B goto`.
