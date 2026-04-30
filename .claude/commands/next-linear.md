---
description: Pull the single highest-priority eligible Linear issue, claim it, route it through the right G-Stack flow, and ship/land only when gates allow.
---

# Next Linear

Single-issue Linear intake for Jovie. Use this when opening a fresh workspace and asking for the best next Linear issue to run through G-Stack.

This command is intentionally not continuous and not parallel:

- Use `/autopilot` for continuous orchestration.
- Use `/swarm` for parallel worktree batches.
- Use `/next-linear` for one best next issue in the current workspace.

## Arguments

Optional:

- No args: pick the top eligible issue.
- `JOV-1234`: run that specific issue through the same gates.
- `--plan-only`: select, claim when appropriate, and produce the G-Stack plan only. Do not implement, ship, or land.
- `--no-land`: implement and ship a PR, but stop before `/land-and-deploy`.

If multiple arguments are present, apply all of them. Example: `JOV-1234 --plan-only`.

## Required Environment

Run from the Jovie repo root.

Before executing task work, verify:

```bash
node --version
pnpm --version
```

Required:

- Node.js 22.x
- pnpm 9.15.4

Use root commands only. Secret-bound commands must be run through Doppler as documented in `AGENTS.md`.

## Linear Gating

Before reading code or editing files, apply the Linear gate.

Always skip, without commenting or changing the issue:

- Issues labeled `human-review-required`
- Issues whose description contains `This issue requires human review`
- Issues with blocking labels or text that explicitly require a human decision before work starts

If a direct `JOV-1234` invocation points at a skipped issue, stop and report that the issue requires human review.

## Intake

### Direct Issue Mode

If an issue identifier was provided:

1. Fetch that issue from Linear.
2. Fetch its comments.
3. Apply the Linear gate.
4. Continue only if eligible.

### Pick Next Issue Mode

If no issue identifier was provided:

1. Query Linear team `Jovie` for candidate issues in:
   - `Triage`
   - `Todo`
   - `Backlog`
2. Exclude `human-review-required` labels and descriptions containing `This issue requires human review`.
3. Also inspect `In Progress` issues only for stale rescue candidates. A stale rescue candidate must satisfy all of:
   - No assignee, or assigned to the current user.
   - No open PR exists for the issue branch or `jov-XXXX`.
   - No meaningful update in the last 24 hours.
4. Rank candidates by:
   - Priority value, lowest number first: Urgent, High, Normal, Low.
   - Launch/blocker/severity labels: `launch-blocker`, `severity:P0-blocker`, `security`, then `severity:P1`.
   - Active project or cycle recency.
   - Most recently updated.
5. Select exactly one issue.

If no eligible issue exists, stop and report that there is no eligible Linear work.

## Claim Flow

Before reading implementation files:

1. Confirm the selected issue is still eligible and not claimed by another active agent.
2. Set the Linear issue state to `In Progress`.
3. Assign the issue to `me` when the Linear tool supports it.
4. Add a short Linear comment:

```markdown
/next-linear picked up this issue.

Workspace branch: <current-branch>
Route: <implementation | future-build | human-question>
Plan mode: <yes | no>
Landing: <enabled | disabled>
```

If there is no direct comment tool available, use the Linear research/natural-language tool to add the comment. If commenting fails but state/assignment succeeds, continue and mention the comment failure in the final summary.

## Context Packet

Build a context packet before choosing the G-Stack route. Include:

- Issue ID, title, URL, priority, status, labels, assignee, project, and cycle.
- Linear `gitBranchName`.
- Full description.
- Full comments and notes.
- Acceptance criteria.
- Explicit in-scope and out-of-scope sections.
- Attached or linked plan references.
- Any linked blockers, duplicates, or related issues visible through Linear.

Preserve Linear plan text and acceptance criteria verbatim where possible.

## Route Selection

Classify the issue after the context packet is built.

### Implementation Track

Use this track for:

- Labels: `Bug`, `fix`, `security`, `performance`, `test-flakiness`, `stability-audit`, `type:test`, `qa:*`
- Titles/descriptions containing: bug, fix, broken, failing, regression, flaky, canary failure, incident, performance, a11y, QA
- Well-specified chores/tests/docs where acceptance criteria are clear

Required flow:

1. Produce a concrete implementation plan from Linear context.
2. Run `/autoplan` for normal reviewed planning.
3. If the issue touches risky scope, also run `/plan-eng-review`.
4. If the issue changes product strategy, scope, pricing, positioning, user promise, or launch sequencing, also run `/plan-ceo-review`.
5. Implement only after unresolved human questions are cleared.
6. Run `/qa` with Exhaustive tier unless the issue is non-UI docs-only.
7. Run `/review`.
8. Run `/ship`.
9. If `--no-land` is not present and all gates are green, run `/land-and-deploy`.

### Future-Build Track

Use this track for:

- Labels: `type:feature`, `enhancement`, `Feature`
- Titles/descriptions with future-build language: build, new design, new flow, launch, future, explore, concept, plan
- Missing or ambiguous acceptance criteria
- Product or UX intent that needs sharper problem framing before code

Required flow:

1. Feed the Linear context packet into `/office-hours`.
2. Convert the Office Hours output into a concrete implementation plan.
3. Run `/autoplan`.
4. Proceed to implementation only if the reviewed plan has:
   - Clear success criteria.
   - Explicit out-of-scope boundaries.
   - No unresolved human-choice questions.
5. If unresolved human-choice questions remain, stop and ask only those questions.
6. If implementation proceeds, run `/qa` Exhaustive, `/review`, `/ship`, and then `/land-and-deploy` unless `--no-land` is present.

### Escalation Track

Stop and ask the user before implementation when any of these are true:

- The issue has human-review signals.
- The issue requires a schema migration, remote infrastructure provisioning, billing behavior change, auth/security policy change, public endpoint contract change, or destructive data operation.
- The likely PR exceeds 10 files or 400 diff lines.
- The issue conflicts with existing product direction or another active Linear issue.
- The correct route cannot be determined after reading Linear context.

## Risk Routing

Require `/plan-eng-review` for any issue touching:

- Auth, billing, entitlements, Stripe, Clerk, database writes, migrations, public/webhook endpoints, CSP, middleware/proxy behavior, CI/deploy infrastructure, or shared app shell architecture.

Require `/plan-ceo-review` for any issue touching:

- Product promise, pricing/packaging, onboarding direction, marketing claims, launch sequencing, founder/customer identity, or scope that changes what users think Jovie does.

Run design review through `/autoplan` when UI scope is present. UI scope includes screens, components, layout, navigation, forms, drawers, dialogs, mobile behavior, loading/empty/error states, or visible copy.

## Execution Rules

- Do not edit code before the Linear claim flow completes.
- Keep one PR tied to one Linear issue.
- Do not batch issues in `/next-linear`.
- Search for sibling bugs when fixing a bug.
- Respect migration immutability and all hard guardrails in `AGENTS.md`.
- Keep the branch/PR metadata discoverable by Linear automation by preserving `jov-XXXX`.
- If a new branch is needed, prefer `itstimwhite/jov-XXXX-<short-slug>`.

## Validation

Use the G-Stack flow as the primary validation path:

1. `/qa` with Exhaustive tier, unless docs-only/non-UI.
2. `/review`.
3. `/ship`.

`/ship` handles its own pre-flight checks. If you run manual checks before ship, use scoped commands first and Doppler for secret-bound commands.

Before pushing, formatting must be clean. Follow `AGENTS.md` guidance for Biome and root commands.

## PR And Linear Handoff

PR body must include:

```markdown
Linear: <issue-url>

<!-- linear-issue-id:JOV-XXXX -->
```

Also include:

- Summary of the change.
- Validation evidence.
- Rollback notes for risky changes.
- Deferred follow-up Linear issue IDs, if any were created.

After PR creation:

1. Check whether repo automation has moved the issue to `In Review`.
2. If this was an ad-hoc/manual PR and automation cannot transition it, move the issue to `In Review` once and comment with the PR URL.
3. Never manually move the issue to `Done`; merge automation owns that.

## Landing Gate

Run `/land-and-deploy` only if all are true:

- `--plan-only` is absent.
- `--no-land` is absent.
- PR exists and CI/review gates are green.
- No blocking labels are present on the PR.
- Linear issue still has no human-review signals.
- The change did not surface unresolved product, security, or data-risk questions.

If any condition fails, stop at the PR and report the blocker.

## Dry-Run Checklist

Before concluding the command has a valid route, mentally dry-run against:

- A high-priority feature issue.
- A bug or regression issue.
- A `human-review-required` issue.
- A stale `In Progress` rescue issue.
- A direct `JOV-XXXX` invocation.

The dry run must confirm:

- No code is read or edited before the Linear claim flow completes.
- Human-review issues are untouched.
- Stale rescue work does not collide with an active PR.
- Ship and land are separated by explicit gates.
