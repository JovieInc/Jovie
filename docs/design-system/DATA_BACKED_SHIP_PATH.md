# Data-backed Pen ship path (JOV-13853)

Truth for design shipping is **not** a `.pen` blob in the merge queue.
CI validates contracts and ratchets only.

## Required evidence

1. **Live persist receipt** — `save()` with no path on Tim’s open canvas, then
   prove mtime moved
   ([`PEN_LIVE_CANVAS.md`](../../scripts/agent/PEN_LIVE_CANVAS.md);
   `disk_persist_verified`). `Saved` alone is not persist.
2. **Lease save** —
   `node scripts/pen-review/run.mjs lease acquire` → mutate →
   `save --holder … --token … --touched …`.
3. **Registry identity map** — code registry ids
   (`componentRegistry.ts` / `pen-code-registry.mjs`) plus
   `pen-bindings.json` for route↔frame. Pen-only roots are not denominators.
4. **Small code sync PR** — tokens / `packages/ui` / consumers / stills /
   bindings (atomic slice).
5. **Optional prod/Pen parity probe** after land — never a reason to dump the
   canvas into git.

## Forbidden

Adding/modifying `*.pen` for the merge queue; treating Pen-through-CI, cold
`.pen` readback, or backup overlays as the validation gate; inventing a second
file (`--out`, `save({path})`) to fake persist.

## Machine gate

```bash
pnpm design:pen-ship:check              # fail closed on .pen blobs
pnpm design:pen-ship:validate --receipt path/to/receipt.json
pnpm design:pen-ship:pilot              # docs/guard pilot receipt
```

Schema `jovie.pen-data-backed-ship/v1` —
`scripts/design/pen-data-backed-ship-lib.mjs`.

## Pilot

This doc + `design:pen-ship:*` are the first ship on the path: no `.pen` enters
the queue; CI only checks the contract guard.
