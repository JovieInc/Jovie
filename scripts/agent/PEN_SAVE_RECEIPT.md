# Pen file lock and saved-state receipt

`pen-save-receipt.mjs` is a fail-closed gate for captured Pen editor evidence. It never opens, reads, hashes, writes, renames, or deletes a `.pen` file. It may read filesystem metadata for protected profile paths to reject aliases. Evidence must be a non-symlink, single-link, regular text/JSON file no larger than 1 MB; the CLI opens it with `O_NOFOLLOW`, verifies the opened descriptor against protected device/inode identities, then reads that same descriptor.

## Lock source

Canonical identity is not a CLI argument. `--profile jovie-founder-design-studio` resolves through `pen-workspace-locks.json` to:

- approved writable identity, only when active path matches: `$HOME/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.pen`
- source-backed read-only catalog: `$HOME/Documents/Jovie/Jovie Marketing Workspace/Jovie Marketing Workspace.pen`

An agent cannot make a side file canonical by passing it as the expected path.

## Trust boundary

This receipt is for **batch close / handback**, not a per-edit gate. If the target canvas is open, attach to the live desktop canvas and keep working while it is dirty. See [`PEN_LIVE_CANVAS.md`](PEN_LIVE_CANVAS.md).

Before mutation, capture the active path with Pencil `get_app_state` using all required schema flags. Establish one coordinated writer and mutation batch. After the batch:

1. Capture post-save app state and verify the active path is unchanged.
2. Explicitly save the existing locked file with `save()`, `Cmd-S`, `editor-save`, or `save-document`. `save({path})`, `--out`, autosave, and Save As are rejected.
3. Prove disk persist: the locked canonical file's mtime must move (`pen-live-canvas-persist.mjs`). `Saved` text alone is insufficient.
4. Capture the explicit save acknowledgment and post-save window state.
5. When dirty state is exposed at handback, prefer `clean`. Dirty during attach/work is not a bail.
6. Re-read every intended root and capture a deterministic text/JSON artifact containing the root IDs and relevant fields/sentinels.
7. Run the receipt gate. It hashes all five evidence artifacts and binds the root IDs and pinned path to their contents.

If Pen displays Save/Don't Save, choose **Cancel**. If no dialog is displayed, leave Pen untouched. After a Pen/renderer/MCP restart, disconnect, crash indication, timeout, or unexpected path change, invalidate the writer and batch; do not save, discard, retry, resume, close, or switch.

The only passing verdict is `saved_state_verified`, and every receipt says `durability: not_proven`. The tool verifies evidence consistency for the observed saved state; it does not prove crash/restart persistence or the authenticity of a caller-created evidence artifact. Autosave, a visible canvas change, an MCP success response, or an opaque file in `~/.pencil/backup` is corroborating evidence only.

## Invocation

```bash
node scripts/agent/pen-save-receipt.mjs \
  --profile jovie-founder-design-studio \
  --active-path-before "/absolute/canonical.pen" \
  --active-path-after "/absolute/canonical.pen" \
  --document-title "canonical" \
  --writer "agent-veronica" \
  --batch-id "header-candidates-04" \
  --batch-started-at "2026-08-10T21:46:59.000Z" \
  --root-id "dn0Es" \
  --root-id "co5mw" \
  --mutation-state confirmed \
  --save-method Cmd-S \
  --save-requested-at "2026-08-10T21:47:00.000Z" \
  --save-acknowledged-at "2026-08-10T21:47:01.000Z" \
  --save-acknowledged true \
  --dirty-state clean \
  --post-readback-at "2026-08-10T21:47:02.000Z" \
  --readback-verified true \
  --recorded-at "2026-08-10T21:47:03.000Z" \
  --pre-app-state-evidence /tmp/pre-app-state.json \
  --post-app-state-evidence /tmp/post-app-state.json \
  --window-state-evidence /tmp/window-state.txt \
  --save-response-evidence /tmp/save-response.txt \
  --readback-evidence /tmp/root-readback.json
```

Exit `0` means the captured saved state is internally consistent. Exit `1` means blocked. Exit `2` means the command or evidence files were malformed.

## Promotion fallback gate

A passing `saved_state_verified` receipt proves the observed save evidence is consistent; it is live-app evidence only. The pinned Pen runtime has no native non-evaluating complete semantic inspector, so `pen-cold-readback/v2` fails closed with `safe_cold_manifest_unavailable` before any Pen or `.pen` access. `pen-promotion-gate.mjs` therefore returns `live_readback_only`; `cold_round_trip_verified` is unreachable until a separately reviewed native inspector contract exists. A desktop that stays dirty after a claimed save still surfaces `desktop_dirty_after_save`. See [`PEN_COLD_READBACK.md`](PEN_COLD_READBACK.md).

## Side-file reconciliation and archive plan

Do not reconcile while any Pen writer is active. Preserve every side file and backup as evidence.

1. Freeze all document switches. If the active path differs from the profile lock, there is no safe writable path.
2. Inventory each file without opening it: absolute path, birth/modified time, size, existing checksum evidence when already available, and provenance class. Computing a new content hash requires separate read authorization.
3. In a separately approved single-writer operation, compare canonical and side-file roots through Pen, then copy selected roots into the declared canonical file using isolated proposal roots. Save and receipt that canonical mutation.
4. Only after reconciliation is verified, move side files into a dated archive directory with their original names and the inventory manifest. Never delete them. Keep `~/.pencil/backup` separate as recovery evidence.
