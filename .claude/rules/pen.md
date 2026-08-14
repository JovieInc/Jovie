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
