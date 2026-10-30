# BLOCKER: PR 17021 Size Guard vs remaining Summer stack

Exact head: `5353b248ff636025fd1ff275a6948e6bfbde1c0f`
PR: https://github.com/JovieInc/Jovie/pull/17021
Issue: JOV-5853
Date: 2026-09-03

## Failing required check

`PR Size Guard` — 3259 changed lines / 19 files; cap 1500/75.
Run: https://github.com/JovieInc/Jovie/actions/runs/33805426412/job/100814640863

## What was repaired

The branch was conflicting with `origin/main` (Eve 0.47.6 identity routing).
The remaining original stack (`337b440a3` … `8cd212406`) was replayed onto
exact `origin/main`. Photon/iMessage stays Summer; `ovie-summer-shadow` and
`ovie-summer-bottleneck` stay Summer. Isolated Eve CI passed on this head
(Node 24). `ci-fast`, typecheck, `PR Ready`, and `PR targets main` passed.

## Why Size Guard cannot be fixed in this PR

Layer 7 is 4 files / 360 lines (`8cd212406`). It depends on unlanded layers
3–6 (#17017–#17020). Those parents are still open, so a `main`-based child
must carry their trees.

Constraints that close every local escape hatch:

1. `PR targets main` is a required check and forbids a parent base.
   Retargeting to #17020 makes Size Guard 360 lines and fails that gate.
2. Do not open a second PR; do not add `big-pr` (not a mechanical codemod);
   do not weaken Size Guard.
3. Do not merge, deploy, or ready this draft while the parent stack is open.

Sibling size against `main` (GitHub additions+deletions at last observation):

| PR | Layer | Approx. lines vs main | Under 1500? |
| --- | --- | --- | --- |
| #17017 | 3 runtime | 1125 | yes |
| #17018 | 4 adapters | 1532 | no |
| #17019 | 5 durability | 2654 | no |
| #17020 | 6 ingress | 2896 | no |
| #17021 | 7 CI repair + 3–6 | 3259 | no |

## Unblock path

Land #17017 onto `main` first (it is the only remaining layer currently under
the cap). Rebase each later child onto exact `main` after its parent lands so
GitHub counts only that layer. After #17020 lands, rebase this head so the
unique diff is the original 4-file / 360-line layer 7, then Size Guard can
pass without weakening a gate.

## Optimization contract

Justified exception: non-product / non-optimizable Eve-pilot commissioning
infrastructure. JOV-INV-012 product optimization surfaces do not apply.

## Not done

Did not ready, merge, deploy, or add `big-pr`. PR remains draft.
