---
paths: ["**/*.pen", "scripts/agent/pen*", "docs/design-system/**"]
---

# Pen Workspace File Lock

Read this before any Pen mutation. `CLAUDE.md` only points here.

## Identity

Resolve one versioned workspace profile from
[`scripts/agent/pen-workspace-locks.json`](../../scripts/agent/pen-workspace-locks.json)
and establish one writer through the coordination preflight. The active editor
path must match the profile's non-overridable canonical path before and after
every mutation batch.

Never create a document, use New / Open / Open Recent / Save As, rename, close,
or switch documents during a run. Do not spawn a second MCP. Recovery files,
backups, source-backed read-only files, and side files are evidence-only until
a separately approved reconciliation.

## Live-canvas attach

If the target canvas is already open, attach with `pen interactive -a desktop`
(optional `-i` only when it is the locked canonical path). One live canvas per
job. Do not pass `--out` or `save({path})` — those invent a second file. Do not
copy `~/.pencil/backup` or any Pencil backup over the live file.

## Dirty/unsaved is not a bail

A live-canvas write is valid work. Do not stop because the file is dirty. Do
not require a save receipt after every edit. Do not present Save/Don't Save
dialogs to the human as the workflow.

## Batch close / handback

Call `save()` with no path argument on the attached live canvas. Then prove
disk persist with
[`scripts/agent/pen-live-canvas-persist.mjs`](../../scripts/agent/PEN_LIVE_CANVAS.md):
the locked canonical file's mtime must move. `save()` printing `Saved` is not
persist. `pen-save-receipt/v1` remains editor-state evidence at handback; it
does not replace the mtime gate. Autosave, a visible canvas change, an MCP
success response, or an opaque backup alone is insufficient.

## Writer lease and guarded save

One writer at a time is enforced, not assumed. Before any mutation batch, take
the lease: `node scripts/pen-review/run.mjs lease acquire --holder <you> --scope <what>`
(exit 3 and the holder's name when another agent holds it; an expired lease can
be taken over). Save only through `node scripts/pen-review/run.mjs save --holder <you>
--touched <top-level ids you changed>`: it refuses unless you hold the lease, and
refuses when a top-level node differs between the live canvas and disk but is
not in your touched set. Saving would publish another agent's unsaved work
(2026-11-01: a golden-path save wrote `T1E2z` and `BVsfD`). Release with
`lease release`.

## PROPOSAL review loop

Frames named `PROPOSAL / …` (or with a `· PROPOSAL` segment) are reviewed
automatically by `scripts/pen-review/` (launchd on every canonical save plus a
10-minute sweep; installer `scripts/hostops/install-pen-review.sh`). Render,
render guard, deterministic checks, System-1 panel, fix, re-render; only frames
renamed `· ready for Tim r<receipt>` may be shown to Tim. Receipts:
`~/.local/state/jovie-pen-review/receipts/<frame>/`.

Every panel includes an artist-dignity reader, and three checks always block:
`artist-dignity` (copy that implies a small audience, empty rooms, failure or
obscurity), `logo-size` (a Jovie mark above `$logo-size-max` 32px; default
`$logo-size-default` 28px; wordmarks cap at 32px tall) and `private-ratings`
("Never push" only on a frame named "fictional catalog").

## Trustworthy renders

Never judge, show or diff a render from the desktop app's raster export. Once
its GPU state degrades it returns byte-identical garbled rows for any frame
wider than about 1000px (0.5x stays clean), and `TakeScreenshot` degrades with
it. Render out of process instead: `exportFramesHeadless` in
`scripts/pen-review/pen-bridge.mjs` reads the live frame tree (unsaved edits
included), grafts it into a private snapshot copy of the canonical file and
exports it with a fresh headless `pen`. The snapshot sits in a hidden sibling
folder with the workspace's `fonts/`, `images/` and other assets linked beside
it: the "?" Material Symbols icons came from headless copies that had no
`fonts/` folder next to them. Each frame is exported twice and the second
export is used. The render guard (`render-guard.mjs`) fails garbled rasters
(speckle per band), blank or noisy renders, fallback glyphs, inkless text and
unloaded image fills. `html-css` exports are structural aids, not pixel truth:
their flex translation stretches some vertical stacks.

## Fast path for Pen agents

1. One `execute` per section, not per node: loops, helpers and spreads; persist
   ids with bare globals (`x=Insert(...)`); fix failures with `edits` and the
   `editId`, never by resending.
2. Components and refs with `descendants` overrides instead of duplicated
   nodes; `$tokens` for colour, spacing, type and logo size, never raw values.
3. Structural checks without screenshots: `Get` visitors with `ctx.bounds` and
   `ctx.problems` (alignment, clipping, off-centre, type scale, raw colours) in
   the same call. `TakeScreenshot` only at the end of a section, on the
   smallest node.
4. Images for review, parity or Tim come from `exportFramesHeadless` (or
   `scripts/pen-review/export-refs.mjs` for parity references), never from the
   desktop raster export.
5. CLI exports: pass the export type explicitly and assert the output file
   exists and is non-empty; failures can exit 0.
6. Headless `pen interactive -i <copy> -o <scratch>` is for read-only snapshot,
   export and render jobs on a copy. Live canonical edits stay in the app with
   one writer. Headless prints raw result text, not JSON, and each `execute`
   has about a 55 s budget: split graft and export into separate calls.
7. Before each batch, `get_app_state()` to confirm the active document.

## Cold readback

[`scripts/agent/pen-cold-readback.mjs`](../../scripts/agent/PEN_COLD_READBACK.md)
fails closed with `pen-cold-readback/v2` and `safe_cold_manifest_unavailable`
before launching Pen or opening, reading, hashing, creating, or writing any
`.pen` document. `scripts/agent/pen-promotion-gate.mjs` therefore preserves
`live_readback_only`; `cold_round_trip_verified` is unreachable until a
separately reviewed native inspector contract exists.

## Crash / dialog

After any Pen/renderer/MCP restart, disconnect, crash indication, timeout, or
unexpected active-path change, invalidate the writer and batch; do not save,
discard, resume, or switch. If Pen displays Save/Don't Save, choose **Cancel**.
If no dialog is displayed, leave Pen untouched. In either case, stop all
mutations, preserve the active work, and report the lock failure. Never ask
the founder to decide whether unknown agent work should be saved or discarded.

## Registry authority and mutation proof

Registry status is singular and machine-recomputed: `metadataStatus` on each registry root is the only authoritative status field, and visible ledger rows are generated, never hand-written. Audit any ledger export with [`scripts/agent/pen-registry-audit.mjs`](../../scripts/agent/PEN_REGISTRY_LEDGER.md) before and after registry mutations; it fails closed on visible/metadata contradiction, duplicate authoritative records, unentitled SAFE, silently retained stale proof, and denominator drift.
