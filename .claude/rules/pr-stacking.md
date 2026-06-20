# PR Stacking & Size

Small, reviewable PRs that move through the Graphite merge queue fast. Big PRs
clog the queue, recursively rebase, and can't be reviewed for taste — so we cap
size and stack instead.

## Size cap (enforced — `.github/workflows/pr-size-guard.yml`)

- Max **800 changed lines** and **40 files** per PR, excluding lockfiles,
  generated code, snapshots, and svg. Tunable via repo vars `PR_MAX_LINES` /
  `PR_MAX_FILES`.
- Over the cap → CI fails. **Split the work** (see below), or — only for an
  approved **mechanical codemod** (token sweep, rename, generated output) — add
  the **`big-pr`** label to bypass.

## Stack, don't pile

- **Dependent work** (B needs A) → a **Graphite stack**: `gt create` per logical
  step. The stack restacks once and lands bottom-up through the queue; children
  auto-retarget to `main` as their base merges.
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
gt create -m "feat(x): step 1"     # base
gt create -m "feat(x): step 2"     # stacked on step 1
gt submit --stack                  # opens/updates the whole stack
```

Enroll each PR with the `merge-queue` label; Graphite merges the stack
bottom-up. See also [`ci-branching.md`](ci-branching.md).
