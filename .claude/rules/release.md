# Release: PRs, Ship, Deploy

PR discipline, ship validation, branch strategy, deploy flow, bot-review blocking.

## PR Discipline (Required)

### Size Limits

- Max 40 files changed per PR (excluding lockfiles, generated files, snapshots, svg)
- Max 800 lines of diff (additions + deletions) — enforced by `pr-size-guard.yml`
  (repo vars `PR_MAX_LINES`/`PR_MAX_FILES`); approved mechanical codemods use `big-pr`
- If a task requires more, split into a `gt` stack with clear dependencies
  (see [`.claude/rules/pr-stacking.md`](pr-stacking.md))

### Pre-Push Gate

The gstack skill pipeline handles verification. The standard agent workflow:

1. `/qa` — Systematic QA testing (skip if already run manually)
2. `/review` — Pre-landing code review (skip if already run manually)
3. `/ship` — Tests, review, PR creation/update (no feature-branch version bump)
4. `/land-and-deploy` — Merge, CI wait, deploy verification
5. Main/release path — run `pnpm version:stamp` to stamp the merged release fan-out, then `pnpm version:check`

`/ship` runs typecheck, lint, and tests as part of its pre-flight checks. There is no separate `/verify` step.

### Bug-to-Test Gate (required before `/ship`)

Bug fixes must ship with regression test evidence. Before `/ship`, run:

```bash
pnpm --filter @jovie/web run test:bug-to-test
```

- **Pass:** continue to `/ship`.
- **Fail:** add/update the smallest regression test, or document `bug-to-test: waived — <reason>` in the PR body for copy-only/config-only fixes.
- `/ship` Step 3.35 re-runs this gate and blocks PR creation when evidence is missing.

**IMPORTANT:** Always run `pnpm biome check --write apps/web` before pushing so formatting issues are fixed in-place. The pre-push hook calls `biome check .` (read-only) and will reject pushes with formatter violations.

### One PR = One Concern

- Each PR addresses exactly one Linear issue or one bug fix.
- Mark the Linear issue `In Progress` before you start editing files (see `.claude/rules/linear.md`).
- No drive-by refactors, no "while I'm here" changes.
- If you find a related issue, create a separate Linear ticket.

### Branch Hygiene

- Always rebase on main before pushing (not merge).
- **History Sanity Check:** Before starting work or rebasing, verify the branch shares a recent ancestor with `main`. Use `git merge-base main <branch>`. If the result is empty or the branch is >5,000 commits behind, it is a zombie; re-plant it onto a fresh `main` base instead of rebasing.

- **Agent routine work:** `tim/jov-*` → `integration/loop-{domain}` → train PR → `main` (see [`.claude/rules/ci-branching.md`](ci-branching.md)). Do not open routine agent PRs directly to `main`.
- **Human / hotfix:** `hotfix/*` or `needs-human` labeled PRs may target `main` with full CI.
- If a PR has been open >24h without progress, close it and re-create from fresh integration base or `main`.

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

- Heavyweight verification (E2E, smoke, preview, Lighthouse, a11y, Storybook, or full builds with secrets) never starts from a source-PR event or label. Use the hosted manual `CI` dispatch, a bounded repository event, or the scheduled/nightly lane.
- For changes affecting deploy behavior, migrations, auth, billing, middleware/proxy logic, environment/config loading, or another high-risk flow, record the risk classification and run only the specific manual deep evidence that materially reduces risk.
- Build, Neon, E2E, Lighthouse, a11y, Storybook, layout, golden-path, and
  extended-smoke lanes do not auto-start from source-PR paths or risk
  classification. No PR label allocates the evidence set. These heavyweight
  lanes stay outside required source `PR Ready`; the native merge queue enforces
  deterministic combined-head unit/build/layout and path-selected iOS evidence.
- `testing`, `deep-ci`, `launch-candidate`, and `deploy-preview` are metadata only. They have no CI fan-out semantics.

- Add `needs-human` when the PR should be held for human review or automation must stop. This is for physical actions only a human can perform (sign agreement, rotate key, flip dashboard toggle).
- If a PR has `needs-human`, do **NOT** enable or preserve auto-merge. Treat the label as a hard stop for unattended automation until a human clears it.
- **Do NOT use `needs-human` for taste/design issues** — taste is advisory and routes to LLM review, not a human queue.

- Use `automerge` only for clearly safe PRs that fit the auto-merge guardrails below.
- Do **NOT** add `automerge` to high-risk paths or to PRs that also need `needs-human`.

- For a bounded preview, dispatch `CI` on the exact ref with `run_preview_deploy=true`. External Vercel preview status remains informational.
- Do **NOT** add a label expecting it to start preview or deep CI.

- Do **NOT** add `skip-migration-guard` unless a human explicitly instructs you to bypass the migration guard for that PR.
- If a migration-related PR seems to require `skip-migration-guard`, stop and escalate with `needs-human` instead of applying the bypass yourself.

- Taste gate labels (`needs-human-taste`, `needs:taste`) are **advisory and do not block merge** per the 2026-07-06 autonomous shipping policy. Taste-flagged PRs route to strong LLM review and ship. Do not hand-edit these labels; the classifier owns them.

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
4. `/ship` handles: tests, review, CHANGELOG `[Unreleased]` notes, commit, push, PR creation/update. It must **not** bump the version fan-out (`VERSION`, `version.json`, `package.json` versions, dated CHANGELOG headings) — see "Version Stamping (main-only)" below.
5. `/land-and-deploy` handles: merge, CI wait, deploy verification.
6. Apply `merge-queue` after the PR is ready. The live
   `MERGE_QUEUE_BACKEND=native` controller treats the label as intent/audit
   evidence, revalidates the exact head, and enrolls through GitHub's queue:
   ```bash
   gh pr edit --add-label merge-queue
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

## Bot Review Comments Are Advisory

**Bot review comments are informative, not blocking.** Per the Autonomous Shipping Doctrine (2026-07-06), correctness is a machine job. CI gate failures are the only pre-merge blockers. Review unaddressed bot comments post-merge and triage them as follow-up issues.

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

### When flagged

- List each unaddressed comment: `file:line` — first 80 chars of body — permalink
- Recommend: "Run `/review` to triage bot comments, or reply to each comment on GitHub"
- These are **advisory** — they do not block merge

### In the readiness report

```
BOT REVIEWS
├─ CodeRabbit:   N unaddressed (advisory)
└─ Greptile:     N unaddressed (advisory)
```

## Deploy Configuration

- Platform: Vercel
- Production URL: https://jov.ie
- Staging URL: https://staging.jov.ie (Vercel preview alias)
- Deploy controller: `.github/workflows/production-controller.yml` authorizes
  the exact successful `CI` attempt and holds the repo-wide production lease;
  `.github/workflows/production-release.yml` owns staging, canary, promotion,
  observational gates, and the sole rollback job.
- Merge method: squash (merge queue)
- Project type: Web app (Next.js monorepo)
- Post-deploy health check: https://jov.ie/api/health

### Deploy flow

- Deploy trigger: a completed successful `CI` workflow run for the exact current
  `main` SHA, with Vercel Git auto-aliasing disabled in `vercel.json`
- Staging deploy: `vercel deploy --prebuilt` → preview URL → `vercel alias` to `staging.jov.ie`
- Canary verification: health check + homepage + profile route against `staging.jov.ie`
- Production promotion: `vercel promote` after canary passes
- Post-promotion: Sentry and OAuth gates emit `passed`, confirmed `failed`, or
  uncertain `error`; only confirmed structured regressions authorize the one
  centralized rollback owner, while uncertainty fails red without rollback.
- Deploy status: exact staged/canonical deployment evidence, observational gate
  outcomes, immutable public/home/Lighthouse probes, final current-main proof,
  and the `Production Verified` generation marker.

### Custom deploy hooks

- Pre-merge: typecheck + lint (CI fast path, ~10–15s)
- DB migrations: run before staging deploy (production DB, additive only)
- Deploy trigger: automatic after successful exact-attempt `main` CI authorization
- Health check: https://jov.ie/api/health (returns `{"status":"ok"}`)

## Version Stamping (main-only)

**Version stamping is main-only. Feature branches and their PRs MUST NOT bump the version fan-out.** This prevents recurring merge conflicts where concurrent PRs all edit the same version lines.

**Protected version fan-out files (do NOT bump on feature branches):**

- `VERSION`
- `version.json`
- the `version` field of root + workspace `package.json` files (`apps/*`, `packages/*`)
- dated release headings in `CHANGELOG.md` (e.g. `## [26.6.61] - 2026-06-28`)

**What feature branches MAY do:**

- Add release notes under the `## [Unreleased]` section of `CHANGELOG.md`.
- Edit `package.json` for dependency/script changes — only the `version` field is protected.

**Enforcement:** `scripts/version-fanout-guard.mjs` runs in CI (`ci-deterministic` job) and fails any non-`main` branch that writes the fan-out. It auto-skips on `main`, `master`, `production`, and `release/*`, `hotfix/*`, `train/*`, `integration/*` branches (the release/integration path). Run locally with `pnpm version:fanout-guard`.

**Stamping on main:** After merge to `main` (or from the release workflow), run:

```bash
pnpm version:stamp        # bump CalVer, write fan-out, promote [Unreleased] → dated heading
pnpm version:check        # validate consistency
```

`scripts/version-stamp.mjs` computes the next `YY.M.PATCH` (increment PATCH within the month, reset to 0 on month rollover), writes all fan-out files, and re-opens a fresh empty `## [Unreleased]` section. Use `--dry-run` to preview or `--set <version>` to stamp an explicit version.

## Changelog

**During development, only add notes under the `## [Unreleased]` section of `CHANGELOG.md`.** The `/ship` workflow appends `[Unreleased]` entries automatically from the diff and commit history. The dated release heading is stamped on the main/release path by `pnpm version:stamp` — never add a dated `## [X.Y.Z] - DATE` heading on a feature branch.

`CHANGELOG.md` uses `merge=union` in `.gitattributes` to auto-resolve merge conflicts between concurrent PRs.

**Customer-friendly format:** The changelog is rendered on the public `/changelog` page, RSS feed, and subscriber emails. Follow these conventions:

- **Summary blockquote:** Add `> plain-language summary` (max 3 sentences) right after the version heading. Written for non-technical users (artists, fans, investors).
- **`[internal]` prefix:** Tag developer-facing entries with `- [internal] ...`. These are hidden from the public page, RSS feed, and emails but preserved for developer reference.
- **Plain language:** Public entries should avoid jargon. Write what changed for the user, not how it was implemented. Example: "Tips now process correctly" not "Stop capture-tip infinite Stripe retry loop".
- **Hidden releases:** Releases where ALL entries are `[internal]` are completely hidden from public surfaces.

**Shared parser:** `apps/web/lib/changelog-parser.ts` is the single source of truth for changelog parsing in the Next.js app (page + RSS feed). `scripts/lib/changelog-parser.mjs` is the Node ESM version used by the email send script.

**Post-merge emails:** After a PR merges to main, run `pnpm changelog:send` to email all verified changelog subscribers (requires `RESEND_API_KEY`, `DATABASE_URL`).

**Spam protection:** `changelog:send` enforces a 24-hour cooldown between product update emails. If subscribers were emailed within the last 24h, the send is skipped automatically. Use `--force` to override for critical announcements.

<!-- ci-harness:start -->
## CI Agent Harness

Generated from `.github/ci-harness/manifest.json`. Do not hand-edit this block; run `pnpm ci:harness:docs` after changing the manifest.

### Stage Contract

| Stage | Exact responsibility |
| --- | --- |
| Source PR | Deterministic path + brand classification, risk classification, `ci-fast`, and diff secret scan. `Migration Guard`, `Fork PR Gate`, and `PR Size Guard` remain separate required contexts. |
| Native merge queue | Re-run deterministic gates on the exact `merge_group` head, then require five affected unit shards, one hosted build + layout workspace, path-selected Xcode, and model-free semantic evals. |
| Queue-proven main | Reuse the exact successful merge-group `PR Ready` proof and skip duplicate fallback work. |
| Direct/admin main | Fail closed through path/risk/fast/secret/migration, all five unit shards, and the combined hosted build + layout job; skipped placeholders are invalid. |
| Production release | One reusable staging/canary/promotion/rollback DAG under one non-cancelling caller lease. |
| Post-deploy | Hosted public, auth, homepage, and explicitly provisioned Lighthouse probes settle into `Production Verified` before notification. |
| Scheduled/manual/event | Exhaustive E2E, Neon, a11y, performance, eval, visual, slop, brand, and repair/report loops. |

### Tiers

| Tier | Purpose | Merge-gate jobs |
| --- | --- | --- |
| Source Fast Gate | Cheap deterministic checks required on each source PR and repeated on the synthetic combined head. | `Path Changes` (both), `ci-fast` (both), `Secret Scan (gitleaks + trufflehog)` (both), `Migration Guard` (both), `Unit Tests` (merge-group) |
| Structural Contract | Mechanical architecture, workflow, docs, and repo-rule checks. | `CI Risk Classifier` (both) |
| Explicit Deep Evidence | Manual, scheduled, or event-driven deep evidence that never starts from or delays ordinary PR Ready. | none |
| Preview Evidence | Hosted manual/event visual, a11y, performance, and preview evidence outside the source-PR event. | none |
| Combined Integration | Affected unit, one hosted build-plus-layout workspace, path-selected Xcode, and model-free semantic evals for GitHub's exact merge-group head. | `Build + Layout (combined)` (merge-group), `iOS Build + Test (combined)` (merge-group), `Promptfoo Evals (deterministic)` (merge-group), `Golden Eval Set (deterministic)` (merge-group) |
| Production Release | Each exact successful main CI attempt feeds one fixed production-mutation FIFO from authorization through staging, promotion, centralized rollback, immutable probes, canonical proof, marker, and best-effort notification; one hosted monitor retry is bounded to controller attempt 1. | none |
| Post-deploy Verification | Hosted public, homepage, and Lighthouse probes target the immutable release URL under the controller lease; authenticated smoke runs only when a complete credential pair exists, while public Better Auth/OAuth gates remain blocking. | none |
| Scheduled Cleanup | Report-first cleanup loops for flakes, coverage drift, harness health, and main-CI repair. | none |

### Merge Gates

Source `PR Ready` may require only `source-pr`/`both` jobs below. Merge-group `PR Ready` may require only `merge-group`/`both` jobs. Informational evidence stays out of both required aggregates.

| Job | Gate stage | Tier | Local remediation command |
| --- | --- | --- | --- |
| `Path Changes` | both | fast-gate | `git diff --name-only origin/main...HEAD` |
| `ci-fast` | both | fast-gate | `pnpm run typecheck && pnpm run biome:check` |
| `CI Risk Classifier` | both | structural-contract | `pnpm ci:harness:check` |
| `Secret Scan (gitleaks + trufflehog)` | both | fast-gate | `./scripts/security/scan-secrets.sh ci-pr origin/main` |
| `Migration Guard` | both | fast-gate | `cd apps/web && ./scripts/check-migrations.sh && ./scripts/validate-migrations.sh` |
| `Unit Tests` | merge-group | fast-gate | `pnpm --filter=@jovie/web run test:fast` |
| `Build + Layout (combined)` | merge-group | combined-integration | `pnpm run build:web && pnpm --filter @jovie/web exec playwright test tests/e2e/hud-scroll.spec.ts --config=playwright.config.noauth.ts --project=chromium` |
| `iOS Build + Test (combined)` | merge-group | combined-integration | `pnpm run ios:lint && pnpm run ios:test` |
| `Promptfoo Evals (deterministic)` | merge-group | combined-integration | `pnpm run evals` |
| `Golden Eval Set (deterministic)` | merge-group | combined-integration | `pnpm run evals:golden` |

### Risk Signals and Opt-in Evidence

Sensitive changes are classified deterministically on source PRs. Smoke and preview are routing signals for hosted manual, scheduled, or event-driven evidence; no PR label allocates a heavy source-event lane. The generic `testing`, `deep-ci`, `launch-candidate`, and `deploy-preview` labels have no CI fan-out semantics.

| Surface | Level | Smoke | Preview | Blocks unattended auto-merge |
| --- | --- | --- | --- | --- |
| CI and workflow control plane | high | yes | yes | no |
| Agent control plane | high | yes | no | no |
| Auth and identity | high | yes | yes | no |
| Activation, AI, and background data flows | high | yes | yes | no |
| Billing and money movement | high | yes | yes | no |
| Database and migrations | high | yes | no | no |
| Proxy and middleware | high | yes | yes | no |
| Environment and runtime config | high | yes | yes | no |
| Public UI and profile surfaces | medium | no | yes | no |
<!-- ci-harness:end -->
