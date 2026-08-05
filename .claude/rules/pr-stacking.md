# PR Stacking & Size

> Part of the canonical [`docs/PR_FLOW.md`](../../docs/PR_FLOW.md). Default: small
> sibling PRs to `main`; dependent work uses a native GitHub stack; a mechanical sweep ships
> as one `big-pr` PR — **never** an uncontrolled N-deep base-on-base pile (that collapsed the queue
> on 2026-06-22, #11689).

Small, reviewable PRs that move through GitHub's native merge queue quickly.
Big PRs clog the queue, recursively rebase, and can't be reviewed for taste —
so we cap size and stack instead.

## Size cap (enforced — `.github/workflows/pr-size-guard.yml`)

- Max **800 changed lines** and **40 files** per PR, excluding lockfiles,
  generated code, snapshots, and svg. Tunable via repo vars `PR_MAX_LINES` /
  `PR_MAX_FILES`.
- Over the cap → CI fails. **Split the work** (see below), or — only for an
  approved **mechanical codemod** (token sweep, rename, generated output) — add
  the **`big-pr`** label to bypass.

## Mechanical codemod sweeps = ONE `big-pr` PR (not N stacked micro-PRs)

A repo-wide mechanical sweep (token-drift / arbitrary-value reduction, a rename,
a generated-output refresh) ships as **one `big-pr`-labelled PR**, or at most a
few **sibling** PRs off `main` split by top-level domain. **Never** as a deep
base-on-base stack of one-PR-per-file/component.

Why: `ci.yml` only triggers on PRs to `main`/`integration/**`, so a stack of N
agent PRs based on each other runs *no* heavy CI on the PR itself. Native queue
landing still requires each child to be retargeted/rebased onto `main` after its
parent lands, then to run the **full** source and combined-head pipeline. A
63-deep token-drift stack = 63 sequential full-CI runs for one mechanical diff,
and any one slow/failing/conflicted member stalls the whole chain. (This
happened — June 2026, collapsed in #11689.) One `big-pr` PR = one CI run.

Agents generating drift/token sweeps: emit a single PR per sweep. Do not create
one stacked PR per component.

## Stack, don't pile

- **Dependent work** (B needs A) → a **native GitHub stacked-PR sequence**:
  push each layer normally and open it against its immediate parent. After the
  parent lands, retarget the child to `main`, rebase it onto the new `origin/main`,
  and push with `--force-with-lease` before running fresh checks. Graphite is not
  required and is not a landing transport.
- **Independent work** in the same area → **sibling PRs** off `main`. They land
  in parallel and don't trigger each other's rebases.
- **One PR = one logical change.** No drive-by refactors — pull them into their
  own PR, and stack it underneath if the feature depends on it.

## When stacking is "appropriate"

- A naturally layered change: schema → API → UI → tests.
- Any change that would otherwise blow the size cap.
- A refactor + the feature that uses it (refactor is the base PR).
- A codemod that's easier to review per-area (one PR per slice, siblings).

## How

```bash
git switch -c feat/x-01 origin/main
git push -u origin feat/x-01
gh pr create --draft --base main --head feat/x-01

git switch -c feat/x-02 feat/x-01
git push -u origin feat/x-02
gh pr create --draft --base feat/x-01 --head feat/x-02
```

Record every branch, PR number, immediate-parent base, and exact head SHA. When
the parent merges, keep its old tip for the rebase boundary, then:

```bash
git fetch origin main
gh pr edit <child> --base main
git rebase --onto origin/main <old-parent-tip> <child-branch>
git push --force-with-lease origin <child-branch>
```

Prove the child remote head was unchanged before rebasing, inspect ancestry and
the semantic diff, and wait for the fresh source checks before queue enrollment.
Keep the parent branch until the child has converged. Land one layer at a time
through GitHub's native merge queue; never bypass it or create a second landing
transport. See also [`ci-branching.md`](ci-branching.md).
