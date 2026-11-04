# Affected-only merge-group CI: design and soundness verdict

Status: design, not implemented. Owner: Summer (CI). Date: 2026-10-31.
Playbook: [`canon/MERGE_QUEUE_STEWARD.md`](../../canon/MERGE_QUEUE_STEWARD.md).

## Question

Can merge-group CI skip web Unit Tests shards when the group touches none of their inputs,
without weakening the gate?

## What runs today

- Merge group: `pnpm turbo test:fast --affected` against `merge_group.base_sha`, 14 shards plus
  `packages/ui`, `fail-fast` on. Turbo affected is package-granular: any `@jovie/web` change runs
  the whole web suite. About 47 jobs and 74 runner-minutes per group; Unit Tests are 18.7 of them.
- PR: `Affected Unit Tests` (Source Validation) selects by import graph (`vitest --changed`) plus
  `scripts/lib/web-source-read-tests.mjs`, which adds tests that read the paths they name from disk.
- Push to main: the merge-group head SHA is the main commit (GitHub fast-forwards main to the
  tested group head; checked on #24057, #24046 and #23978). Push CI already runs only about 4 jobs
  (about 9 runner-minutes) and no Unit Tests. That duplicate is already gone.

## Why file-level skipping is not sound today

1. **Selection is heuristic.** Import graphs miss tests that read files, globs, env, snapshots,
   setup files and `vi.mock` strings. `web-source-read-tests.mjs` recovers file reads from string
   literals, and its own header records that before it existed, source-read guards ejected about
   45 merge groups in 7 days that PR CI had passed. The full merge-group shards are the backstop
   that caught every selection miss. Skipping them on the same heuristic removes the backstop.
2. **Turbo caching cannot prove it.** The `test:fast` task hash covers the whole `@jovie/web`
   package inputs, so any group touching web misses the cache. Groups not touching web are
   already skipped by `run_web`.
3. **No PR-level result exists for the group tree.** PR CI runs affected tests on
   `refs/pull/N/merge` against the main of that moment. The group tree is main plus every entry
   ahead plus the PR, so tree hashes match only for a single-entry group whose base did not
   move. Even then the PR ran a subset, not the full suite, so there is nothing to reuse.

## A sound design (future work)

Skip a test file in a merge group only when a passing result exists for that file with an
identical input key, recorded by a run that actually executed it:

- **Input key** = hash of the test file, every file it read at runtime (an `fs` and module-loader
  trace from a Vitest setup hook, not static analysis), Vitest and setup config, the lockfile,
  the Node version and the test environment variables.
- **Never skippable:** tests that spawn subprocesses, open sockets, read the clock without fake
  timers, or whose trace is incomplete. Unknown means run.
- **Result store:** content-addressed, written only by trusted merge-group and main runs, never
  by PR-controlled code.
- **Rollout:** shadow mode first. Compute "would skip", still run everything, and record every
  test that would have been skipped but failed. Enable only after 0 false skips over at least
  500 merge groups, then keep a 1-in-20 full-run audit that fails closed on any mismatch.

## Verdict

No implementation PR. The proof is not sound with the selection tools that exist today, and the
cheaper duplicate (push-to-main Unit Tests) is already removed. The queue lever that is sound
right now is removing failure classes; see the playbook.

Ship now: nothing. Re-evaluate when: a runtime input trace for Vitest exists and has run in
shadow for at least 500 groups. Then: enable per-file skipping behind the 1-in-20 audit.
