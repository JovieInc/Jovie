# Claude AI Guidelines for Jovie Project

## STOP: Critical Requirements (Verify Before Any Command)

```bash
node --version   # MUST be v22.x (22.13+)
pnpm --version   # MUST be 9.15.4
```

**If wrong version:** `nvm use 22` and `corepack prepare pnpm@9.15.4 --activate`

| Do This | Not This |
|---------|----------|
| `pnpm install` | `npm install` / `yarn` |
| `pnpm --filter web dev` | `cd apps/web && pnpm dev` |
| `pnpm turbo build` | `npx turbo build` |

**Secrets require Doppler:** Prefix commands with `doppler run --` (e.g. `doppler run -- pnpm test`). Run `./scripts/setup.sh` to install and configure. See `AGENTS.md` for full Doppler setup instructions.

---

## Linear Issue Gating

Skip any Linear issue labeled `human-review-required` or containing "This issue requires human review" in its description. Do not work on, close, or comment on these issues. See `AGENTS.md` for full details.

---

> **Full Guidelines:** See `AGENTS.md` at repo root for complete AI agent rules, engineering guardrails, and architecture guidance.

This file is intentionally kept minimal. The canonical source is `AGENTS.md`.

## E2E Testing Auth + Rules (Required)

For any Playwright E2E test requiring authentication, follow the Clerk testing pattern in `AGENTS.md` and the canonical example in `apps/web/tests/e2e/golden-path-signup.spec.ts`.

- Use Clerk official helpers (`@clerk/testing/playwright`) and call `setupClerkTestingToken({ page })` before navigating to `/signin`.
- Create unique test users with `+clerk_test` emails and `createOrReuseTestUserSession` from `apps/web/tests/helpers/clerk-auth.ts`.
- Never reuse auth sessions across tests, hardcode OTP codes, mock Clerk auth, or skip signup/signin with pre-auth tokens unless explicitly testing post-auth behavior.
- Keep E2E assertions behavior-focused, do not mock music fetch in integration/E2E, use Stripe test mode (`4242 4242 4242 4242`), avoid CSS/copy assertions, and prefer `data-testid` selectors.

