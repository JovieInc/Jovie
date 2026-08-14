# Pen live-canvas attach and disk persist

`pen-live-canvas-persist.mjs` is the JOV-5069 gate. It never reads, writes,
copies, or hashes a `.pen` file. Canonical identity comes from
`pen-workspace-locks.json`, not from a caller-supplied expected path.

## Why this exists

Agents were bailing with “file not saved” because the Pen lock required a
clean `pen-save-receipt/v1` after every batch and treated a dirty live canvas
as insufficient. Tom Krcha (pen.dev) told Tim on 2026-08-13: if the canvas is
open, CLI attaches to the **live canvas**, not just the file.

Tonight’s evidence (2026-08-13 23:09 PT):

- `save()` printed `Saved`
- `Jovie Design Studio — canonical.pen` mtime stayed `2026-08-13 23:09 PT`
- size stayed `13,592,453` bytes
- nodes existed only in the live desktop document
- `save({path})` is unknown

`Saved` is not persist. Persist is the locked canonical file’s mtime moving.

## Attach

If the target canvas is already open:

```bash
pen interactive -a desktop
# optional: -i only when it is the locked canonical path
```

Do not pass `--out`. Do not `save({path})`. Do not File → New / Save As.
Do not spawn a second MCP. Do not copy `~/.pencil/backup` over the live file.

Dirty/unsaved is not a bail. Keep one writer and the canonical path lock.

```bash
node scripts/agent/pen-live-canvas-persist.mjs \
  --phase attach \
  --profile jovie-founder-design-studio \
  --active-path "$HOME/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.pen" \
  --attach-mode desktop \
  --writer agent-veronica \
  --batch-id jov-5069-live-canvas \
  --dirty-state dirty \
  --recorded-at 2026-08-14T08:10:00.000Z
```

Exit `0` + `live_canvas_attached` means attach is valid. It does not mean
the file is durable on disk.

## Persist (batch close / handback)

Call `save()` with no path argument on the attached live canvas. Then prove
the locked file moved:

```bash
# capture mtime/size before save(), call save(), capture mtime/size after
node scripts/agent/pen-live-canvas-persist.mjs \
  --phase persist \
  --profile jovie-founder-design-studio \
  --active-path "$HOME/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.pen" \
  --attach-mode desktop \
  --writer agent-veronica \
  --batch-id jov-5069-live-canvas \
  --save-method 'save()' \
  --save-acknowledged true \
  --save-response Saved \
  --mtime-before 2026-08-14T06:09:00.000Z \
  --mtime-after 2026-08-14T08:11:00.000Z \
  --size-before 13592453 \
  --size-after 13594499 \
  --recorded-at 2026-08-14T08:11:01.000Z
```

Exit `0` + `disk_persist_verified` means mtime moved on the locked path.
`durability` stays `not_proven` (crash/restart is still unproven).

If `save()` prints `Saved` and mtime is unchanged, the gate exits `1` with
`disk_mtime_unchanged`. That is tonight’s failure. Do not treat it as saved.
Do not invent a second file to make mtime move. Do not overlay a backup.

## Repro note

On the founder desktop, with `Jovie Design Studio — canonical.pen` already
open and dirty:

1. Record `stat` mtime/size of the locked canonical path.
2. Attach: `pen interactive -a desktop` (no `--out`).
3. Run `save()`.
4. Record `stat` again.

If step 3 prints `Saved` and step 4 mtime equals step 1
(`2026-08-13 23:09 PT` / `13,592,453` bytes in tonight’s run), persist
failed. The gate must stay blocked until a later `save()` on that same
attached canvas moves mtime.

`pen-save-receipt/v1` remains editor-state evidence at handback. It does
not replace this mtime gate. See [`PEN_SAVE_RECEIPT.md`](PEN_SAVE_RECEIPT.md).
