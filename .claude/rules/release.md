# Release: PRs, Ship, Deploy

PR discipline, ship validation, branch strategy, deploy flow, bot-review blocking.

## PR Discipline (Required)

### Size Limits

- Max 10 files changed per PR (excluding lockfiles and generated files)
- Max 400 lines of diff (additions + deletions)
- If a task requires more, split into sequential PRs with clear dependencies

### Pre-Push Gate

The gstack skill pipeline handles verification. The standard agent workflow:

1. `/qa` — Systematic QA testing (skip if already run manually)
2. `/review` — Pre-landing code review (skip if already run manually)
3. `/ship` — Tests, review, version bump, PR creation/update
4. `/land-and-deploy` — Merge, CI wait, deploy verification

`/ship` runs typecheck, lint, and tests as part of its pre-flight checks. There is no separate `/verify` step.

**IMPORTANT:** Always run `pnpm biome check --write apps/web` before pushing so formatting issues are fixed in-place. The pre-push hook calls `biome check .` (read-only) and will reject pushes with formatter violations.

### One PR = One Concern

- Each PR addresses exactly one Linear issue or one bug fix.
- Mark the Linear issue `In Progress` before you start editing files (see `.claude/rules/linear.md`).
- No drive-by refactors, no "while I'm here" changes.
- If you find a related issue, create a separate Linear ticket.

### Branch Hygiene

- Always rebase on main before pushing (not merge).
- Follow the branch strategy: `feature/* → main` (CI deploys to staging, then promotes to production).
- If a PR has been open >24h without progress, close it and re-create from fresh main.

### Incremental Shipping (Ship Fast, Fail Fast)

- When a command produces multiple independent fixes, ship each as its own PR.
- **Open a draft PR on first push** — CI runs immediately, giving early feedback.
- Push frequently — concurrency groups cancel stale CI runs automatically.
- Run `/ship` when ready — it detects the draft PR and promotes it to ready-for-review.
- CI runs in parallel on all PRs while the agent continues working.
- This maximizes throughput: N PRs × parallel CI > 1 large PR × serial CI.
- If a PR fails CI, fix and push again; don't create a new PR.
- Enable auto-merge only after the PR is marked ready (not while draft).

### Draft PR First Workflow (Parallel Agents)

AI agents MUST follow the "draft PR first, commit often" pattern for all non-trivial work:

1. **First commit on branch:** Push immediately and open a draft PR:
   ```bash
   git push -u origin <branch-name>
   gh pr create --draft --base main --title "WIP: <description>" --body "Draft — CI feedback loop in progress"
   ```

2. **Iterate on CI feedback:** Push frequently. Each push triggers CI with cancel-in-progress (stale runs are automatically cancelled). Check CI status:
   ```bash
   gh pr checks <pr-number> --json name,state,conclusion
   ```
   Fix failures, push again.

3. **Finalize:** When CI is green and code is ready, run `/ship`. The ship skill detects the existing draft PR, updates its title/body with the standard template, and marks it ready for review.

**Why draft PRs first:**
- CI catches build failures (now a merge gate), type errors, and test regressions within minutes.
- Parallel agents see each other's in-progress branches via PR list.
- Concurrency groups cancel stale CI runs automatically — frequent pushes are cheap.
- The PR summary comment gives a structured view of all check statuses.

## PR Labels (Required)

Labels are part of the CI control plane, not just project organization. Apply intentionally.

- Add `testing` when a PR needs the heavyweight verification lanes (E2E, smoke tests, full build with secrets) beyond the default merge gate.
- Add `testing` for changes affecting deploy behavior, migrations, auth, billing, middleware/proxy logic, environment/config loading, or any flow that should get E2E and preview QA before merge.
- Note: Build (public routes), Lighthouse, a11y, and layout-guard now run on ALL PRs without the `testing` label. The `testing` label is only needed for E2E/smoke/preview-deploy lanes.

- Add `needs-human` when the PR should be held for human review or automation must stop.
- Add `needs-human` for risky or ambiguous changes, incidents/hotfixes needing human judgment, unexpected CI/deploy behavior, security-sensitive changes, or any case where the agent is not confident the PR should continue through auto-merge.
- If a PR has `needs-human`, do **NOT** enable or preserve auto-merge. Treat the label as a hard stop for unattended automation until a human clears it.

- Use `automerge` only for clearly safe PRs that fit the auto-merge guardrails below.
- Do **NOT** add `automerge` to high-risk paths or to PRs that also need `needs-human`.

- Use `deploy-preview` only when a PR specifically needs the build/preview lane for review or QA and `testing` is not otherwise warranted.
- Do **NOT** rely on `deploy-preview` as a substitute for `testing` on risky changes.

- Do **NOT** add `skip-migration-guard` unless a human explicitly instructs you to bypass the migration guard for that PR.
- If a migration-related PR seems to require `skip-migration-guard`, stop and escalate with `needs-human` instead of applying the bypass yourself.

## Auto-Merge Path Guardrails

Not all PRs are safe for auto-merge. PRs touching high-risk paths require manual review.

**Auto-merge BLOCKED (require manual review):**

| Path / Area | Why |
|-------------|-----|
| `/api/stripe/`, `/api/billing/` | Money — billing bugs cost real revenue |
| Auth middleware, Clerk sync, `proxy-state` | Identity — broken auth locks out users |
| Onboarding flow (`app/(onboarding)`) | First impression — broken onboarding kills conversion |
| Leads/outreach pipeline | Growth engine — silent failures lose prospects |
| Profile ownership / claim flow | Trust — incorrect ownership = legal + trust risk |

**Auto-merge ALLOWED (CI-gated, no manual review needed):**

| Change Type | Examples |
|-------------|---------|
| Docs / copy / README | Markdown files, changelog, legal copy |
| Tests (unit, integration, e2e) | `*.test.ts`, `*.spec.ts`, test fixtures |
| Style-only | CSS, design tokens, Tailwind config |
| Dependency bumps (non-breaking) | Lockfile-only, patch/minor version bumps |
| Linting / formatting fixes | Biome auto-fixes, whitespace, import sorting |

When in doubt, skip auto-merge and request review.

## Pre-PR Checklist (required before opening any PR)

1. **Open a draft PR early** — push your first meaningful commit and create a draft PR immediately.
2. **Iterate** — push frequently, let CI catch issues, fix and push again.
3. **When ready to ship:** run `/qa` → `/review` → `/ship` (skip `/qa` or `/review` if already run manually).
4. `/ship` handles: tests, review, version bump, CHANGELOG, commit, push, PR creation/update.
5. `/land-and-deploy` handles: merge, CI wait, deploy verification.
6. **Enable automerge** with squash after the PR is marked ready:
   ```bash
   gh pr merge --auto --squash
   ```

## Conventional Commits Required

```bash
# Format: type(scope): description
feat(auth): add password reset flow
fix(dashboard): resolve chart rendering issue
refactor(api): simplify user endpoint logic
docs(readme): update setup instructions
```

## Ship Validation (CodeRabbit Issue Planner Instruction)

When generating implementation plans for GitHub issues, the plan MUST include a final **"Ship Validation"** phase as the last step. This phase ensures all changes pass quality gates before a PR is opened.

The validation phase must instruct the coding agent to run:

```bash
pnpm run typecheck && pnpm run biome:check && pnpm run test
```

**Requirements for the Ship Validation phase:**
- All TypeScript type checks pass (zero errors)
- All Biome lint and formatting checks pass (zero errors)
- All unit tests pass
- If any check fails, fix before proceeding to PR creation

## Branch Strategy

```
feature/* ──► main (CI deploys to staging, then promotes to production)
```

- **NEVER** push directly to `preview` or `production`.
- All changes require PR review.

## Bot Review Comments Are Blocking

**Before merging any PR (including via `/land-and-deploy`), check for unaddressed bot review comments.** Unaddressed comments are a **BLOCKER** — do not merge until resolved.

### Bots to check

- `coderabbitai[bot]` (CodeRabbit)
- `greptile-apps[bot]` (Greptile)

### How to check

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
PR_NUMBER=$(gh pr view --json number --jq '.number')

gh api "repos/$REPO/pulls/$PR_NUMBER/comments" --paginate \
  --jq '[.[] | {id, author: .user.login, path, line, body, html_url, in_reply_to_id, position}]'
```

### Classification

For each **root** comment (where `in_reply_to_id` is null) from the bots above:

1. **Outdated** — `position` is null (code was force-pushed past it) → skip
2. **Addressed** — another comment exists with `in_reply_to_id` equal to this comment's `id`, from a non-bot author → skip
3. **Nitpick** — body starts with `[nitpick]` or `**nitpick**` → warning only, not blocking
4. **Unaddressed** — none of the above → **BLOCKER**

### When blocked

- List each unaddressed comment: `file:line` — first 80 chars of body — permalink
- Recommend: "Run `/review` to triage bot comments, or reply to each comment on GitHub"
- Do NOT merge with option C / "merge anyway" — this is a hard gate

### In the readiness report

```
BOT REVIEWS
├─ CodeRabbit:   PASS / N unaddressed (blocker)
└─ Greptile:     PASS / N unaddressed (blocker)
```

## Deploy Configuration

- Platform: Vercel
- Production URL: https://jov.ie
- Staging URL: https://staging.jov.ie (Vercel preview alias)
- Deploy workflow: `.github/workflows/ci.yml` (`deploy-staging` → `canary-health-gate` → `promote-production`)
- Merge method: squash (merge queue)
- Project type: Web app (Next.js monorepo)
- Post-deploy health check: https://jov.ie/api/health

### Deploy flow

- Deploy trigger: automatic on push to `main`, with Vercel Git auto-aliasing disabled in `vercel.json`
- Staging deploy: `vercel deploy --prebuilt` → preview URL → `vercel alias` to `staging.jov.ie`
- Canary verification: health check + homepage + profile route against `staging.jov.ie`
- Production promotion: `vercel promote` after canary passes
- Post-promotion: Sentry error gate (5 minute soak) with auto-rollback
- Deploy status: `vercel promote` exit code + `canary-health-gate` + `sentry-error-gate`

### Custom deploy hooks

- Pre-merge: typecheck + lint (CI fast path, ~10–15s)
- DB migrations: run before staging deploy (production DB, additive only)
- Deploy trigger: automatic on push to `main`
- Health check: https://jov.ie/api/health (returns `{"status":"ok"}`)

## Changelog

**Do not manually edit `CHANGELOG.md` during development.** The `/ship` workflow generates changelog entries automatically from the diff and commit history.

`CHANGELOG.md` uses `merge=union` in `.gitattributes` to auto-resolve merge conflicts between concurrent PRs.

**Customer-friendly format:** The changelog is rendered on the public `/changelog` page, RSS feed, and subscriber emails. Follow these conventions:

- **Summary blockquote:** Add `> plain-language summary` (max 3 sentences) right after the version heading. Written for non-technical users (artists, fans, investors).
- **`[internal]` prefix:** Tag developer-facing entries with `- [internal] ...`. These are hidden from the public page, RSS feed, and emails but preserved for developer reference.
- **Plain language:** Public entries should avoid jargon. Write what changed for the user, not how it was implemented. Example: "Tips now process correctly" not "Stop capture-tip infinite Stripe retry loop".
- **Hidden releases:** Releases where ALL entries are `[internal]` are completely hidden from public surfaces.

**Shared parser:** `apps/web/lib/changelog-parser.ts` is the single source of truth for changelog parsing in the Next.js app (page + RSS feed). `scripts/lib/changelog-parser.mjs` is the Node ESM version used by the email send script.

**Post-merge emails:** After a PR merges to main, run `pnpm changelog:send` to email all verified changelog subscribers (requires `RESEND_API_KEY`, `DATABASE_URL`).

**Spam protection:** `changelog:send` enforces a 24-hour cooldown between product update emails. If subscribers were emailed within the last 24h, the send is skipped automatically. Use `--force` to override for critical announcements.
