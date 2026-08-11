# Pen cold readback and promotion fallback gate

`pen-cold-readback.mjs` opens a `.pen` file **headlessly** through the pen.dev CLI (`pen interactive --in <file> --out <temp>`), reads reusable component metadata with a read-only probe, and exits **without mutation**. It emits a `pen-cold-readback/v1` receipt on stdout. `pen-promotion-gate.mjs` is the fallback gate that decides the strongest truthful verification claim a Pen promotion may make.

These tools exist because the desktop app is not always available or truthful: Pen desktop 1.2.4 / `@pen.dev/cli` 0.3.2 can leave the title at `— Edited` even after a byte-successful CLI `save()` and native `Cmd-S`, and the documented headless existing-file flow can fail with `Error loading scene graph: Error: Base URI must be absolute!` on asset-bearing files.

## Trust boundary

- The command never writes to the target `.pen` file. The read-only probe sends `get_app_state` and one `execute` that only `Print`s; `save()` is never sent. `--out` points at a disposable temp path.
- It sha256-hashes the target bytes before and after; any change blocks verification with `bytes_changed_during_readback`.
- Canonical identity comes from `pen-workspace-locks.json` (`--profile`), never from a caller-supplied path.
- `--fixture <abs path>` mode runs against a disposable asset-bearing fixture. A fixture must be an absolute `.pen` path and may not alias (path, symlink, or hard-link) the profile's canonical or read-only paths.
- All rules in [`PEN_SAVE_RECEIPT.md`](PEN_SAVE_RECEIPT.md) still apply. A cold readback is not a mutation batch and does not authorize one.

## Invocation

```bash
# Canonical file (headless, read-only):
node scripts/agent/pen-cold-readback.mjs --profile jovie-founder-design-studio

# Disposable fixture with expected reusable components:
node scripts/agent/pen-cold-readback.mjs \
  --fixture /tmp/pen-fixture/asset-bearing.pen \
  --expect-component dn0Es \
  --pen-bin ./node_modules/.bin/pen \
  --timeout-ms 120000

# Attach observed desktop save state for a typed dirty reason:
node scripts/agent/pen-cold-readback.mjs --profile jovie-founder-design-studio \
  --desktop-title "Jovie Design Studio — canonical — Edited" \
  --desktop-dirty-state dirty
```

Exit `0` means `cold_readback_verified`: the file loaded headlessly, the probe ran, and the bytes are unchanged. Exit `1` means `cold_readback_failed`; the receipt carries typed reasons. Exit `2` means malformed invocation.

## Typed reasons

| Code | Meaning |
|------|---------|
| `auth_unavailable` | CLI needs `pen login` / `PEN_CLI_KEY`; nothing was loaded. |
| `scene_graph_base_uri_not_absolute` | Headless load failed with `Base URI must be absolute!` — the signature suspected for relative imported-image references. |
| `scene_graph_load_failed` | Generic scene-graph load failure. |
| `export_bbox_invalid` | `Export bounding box is invalid` during export. |
| `cli_unavailable` | The `pen` binary could not be spawned. |
| `cli_timeout` | Headless run exceeded `--timeout-ms`; state is unknown. |
| `cli_exit_nonzero` | Nonzero exit without a known signature. |
| `bytes_changed_during_readback` | Target bytes changed during a supposedly read-only run. |
| `expected_component_missing` | An `--expect-component` ID was not read back. |
| `desktop_dirty_after_save` | Observed desktop title/dirty state still reports Edited after a claimed save. |

## Fixture A/B procedure (Base URI root cause)

Run this on a machine with an authenticated pen CLI (`pen status` is green). It proves or disproves relative imported-image references as the `Base URI must be absolute!` root cause:

1. Back up the canonical file before any mutation (copy bytes, record sha256).
2. Create fixture **A** (no images): `pen interactive --out /tmp/pen-fixture/no-assets.pen`, insert one frame, `save()`, `exit()`.
3. Create fixture **B** (relative image): same, but insert an image node that references a relative/local asset path, `save()`, `exit()`.
4. Run `pen-cold-readback.mjs --fixture` on both.
5. Interpretation: A verifies and B fails with `scene_graph_base_uri_not_absolute` → relative image reference is the root cause. Both fail → the trigger is elsewhere (record the typed reason). Both verify at a newer CLI version → the bug is fixed upstream; record versions.
6. Fixtures are disposable evidence. Never point `--fixture` at the canonical file, and never directly edit encrypted `.pen` bytes.

## Save-state truthfulness

A byte-successful CLI `save()` does not prove the desktop cleared its dirty state (observed on desktop 1.2.4 / CLI 0.3.2). The truthful rule:

- If the desktop title still reports `Edited` or dirty state is not `clean`, pass `--desktop-title` / `--desktop-dirty-state`; the receipt fails with typed reason `desktop_dirty_after_save` instead of silently claiming success.
- `pen-save-receipt/v1` already blocks on `document_title_edited` and `dirty_or_unknown` for the same reason.
- Do not work around a dirty desktop by re-saving, restarting, or switching documents; follow the lock-failure rules in [`PEN_SAVE_RECEIPT.md`](PEN_SAVE_RECEIPT.md) and [`AGENTS.md`](../../AGENTS.md).

## Promotion fallback gate

`pen-promotion-gate.mjs` evaluates a `pen-save-receipt/v1` receipt plus an optional `pen-cold-readback/v1` receipt and emits a `pen-promotion-gate/v1` claim:

```bash
node scripts/agent/pen-promotion-gate.mjs \
  --save-receipt /tmp/save-receipt.json \
  --cold-readback-receipt /tmp/cold-readback.json
```

| Claim | Meaning |
|-------|---------|
| `cold_round_trip_verified` | Save verified **and** a canonical-mode cold readback after the save verified. Only this claim may be cited as cold round-trip verification. Exit `0`. |
| `live_readback_only` | Save verified, but cold readback is missing, stale, fixture-only, path-mismatched, or failed. Promotion evidence must say exactly this. Exit `1`. |
| `unverified` | The save receipt itself did not verify (includes `desktop_dirty_after_save`). Exit `1`. |

A Pen promotion **must not** claim cold round-trip verification when only live-app readback succeeded. Live-app readback (`pen interactive -a desktop`) is corroborating evidence only, exactly like autosave or an MCP success response. This gate does not authorize promoting any `PROPOSAL / NOT SOURCE-BACKED` component; promotion rules are unchanged.
