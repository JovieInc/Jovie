# Data-backed Pen ship path (JOV-13853)

Truth for design shipping is **not** a `.pen` blob in the merge queue.
CI validates contracts and ratchets only.

## Required evidence

1. **Live persist receipt** — attach to Tim’s open canvas, `save()` with no
   path, then prove mtime moved via
   [`scripts/agent/pen-live-canvas-persist.mjs`](../../scripts/agent/PEN_LIVE_CANVAS.md)
   (`disk_persist_verified`). `Saved` alone is not persist.
2. **Lease save** — acquire
   `node scripts/pen-review/run.mjs lease acquire …`, mutate under the lease,
   then `… save --holder … --token … --touched …` so foreign unsaved work is
   not published.
3. **Registry identity map** — code registry ids
   (`apps/web/data/marketing/componentRegistry.ts` via
   `scripts/agent/pen-code-registry.mjs`, plus
   `docs/design-system/pen-bindings.json` for route↔frame bindings). Pen
   roots that are not code identities are not ship denominators.
4. **Small code sync PR** — tokens / `packages/ui` / consumers / stills /
   bindings. Atomic: ≤10 files / ≤400 lines unless widened with a reason.
5. **Optional prod/Pen parity probe** — still diff / pen-diff / certification
   probe after land. Never a reason to dump the canvas into git.

## Forbidden

- Adding or modifying `*.pen` in a PR destined for the merge queue
- Treating Pen-through-CI, cold `.pen` readback, or backup overlays as the
  validation gate
- Inventing a second file (`--out`, `save({path})`) to fake persist

## Machine gate

```bash
# Fail closed if this branch introduces .pen blobs
pnpm design:pen-ship:check

# Validate a handback receipt (mtime + lease + registry + code paths)
pnpm design:pen-ship:validate --receipt path/to/receipt.json
```

Schema: `jovie.pen-data-backed-ship/v1` in
`scripts/design/pen-data-backed-ship-lib.mjs`.

## Pilot

This document and the `design:pen-ship:*` scripts are the first ship on the
path: no `.pen` blob enters the queue; CI only checks the contract guard.
