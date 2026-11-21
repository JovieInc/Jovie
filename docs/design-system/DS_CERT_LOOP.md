# Design-system certification loop

One loop finishes design-system certification and keeps it finished. Any
worker can run it: Claude, Codex, or Summer. A component is done when it
passes every static criterion (`ds-owner`, `tokens`, `states`, `tests`,
`a11y`, `frontend-rules`, `forced-caps`) and a gate entry holds all seven,
so the shrink-only gate fails any later PR that breaks it.

```sh
node scripts/ds-cert-loop.mjs status            # how many are left
node scripts/ds-cert-loop.mjs plan --out-dir tmp/ds-cert-loop   # work orders
node scripts/ds-cert-loop.mjs verify --order tmp/ds-cert-loop/dsc-01.json
node scripts/ds-cert-loop.mjs gate --shard <branch> --order <order>
```

## The loop

1. **Find.** `status` runs the static certifier and lists every component
   that fails a criterion or has no full gate entry.
2. **Plan.** `plan` cuts that list into work orders of 30 components in path
   order, so orders rarely touch the same files.
3. **Fix.** A worker takes one order on its own branch and fixes the source
   or adds the missing evidence. Fixes follow the certifier's own spec
   (`node scripts/component-certificate.mjs --component <path> --spec`).
4. **Lock.** `gate --shard <branch> --order <order>` adds a gate entry for
   every component in the order that now passes. New keys go to the
   branch's own shard in `component-certification.d/`, so batch PRs never
   conflict. A key another file already names is widened in place.
5. **Verify.** `verify --order <order>` exits 0 only when every component in
   the order is done. Anything else is listed, and the worker iterates on
   that list. A component that needs a product decision goes in the order's
   `skipped` map with the reason, and is reported, never silently dropped.
6. **Ship.** One PR per order, labelled `codemod`, merges on green.
7. **Repeat** until `status` says 0. Then the loop stands down; the gate keeps
   the result.

## Rules for workers

- Never raise a baseline, weaken a test, or remove a gate entry.
- Never edit another branch's shard.
- `verify` is the definition of done. A PR whose order does not verify does
  not ship.
