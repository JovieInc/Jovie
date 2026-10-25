# Pen operations

Binding rules (single writer, live-canvas attach, `save()` without a path, mtime persist gate, cold-readback fail-closed, crash/dialog handling, registry audit): `.claude/rules/pen.md`. This guide adds how to use the tools; it does not restate those rules.

## What Pen gives us (pen CLI 0.3.x; check `pen --help`, `pen interactive --help`, and `read_skill()`)
- MCP/`pen interactive` tools: `get_app_state`, `execute`, `read_skill`, `get_style`, `browser` (desktop app only), plus `save`, `import_library`, `list_libraries`, `remove_library`.
- `execute` API: `Insert Copy Update Replace Move Delete Generate SetVariables GetVariables Get Print TakeScreenshot Export FindEmptySpace`. `Get(path|visit, {depth, resolveVariables, resolveInstances})`; a failed `execute` rolls back entirely; fix with `edits` + `editId`, never resend. Read `read_skill({path:"execute.md"})` and `pen-schema.md` before writing.
- Variables: types color/number/string, theme axes, aliases; `SetVariables(vars, replace?)` merges by default (never pass `replace:true` on the canonical file).
- Code to Pen: `browser` tool `load-page`, `import-to-canvas` (nodes carry source tag and code component name), `return-element` (DOM + computed styles), `return-screenshot`.
- Pen to code: `Export(nodeIds, "html-tailwind"|"html-css"|png|jpeg|webp|pdf, path)`, `Get` with `resolveVariables`.
- Agent mode `pen --in a.pen --out b.pen --prompt ... [--model] [--usage usage.json]`: writes a new file. Do not use on the canonical file or library. `--tasks` exits after the first successful task, so it is not a batch runner; run one process per task.
- Export can print an error and still exit 0: assert the output exists and is non-empty.

## Modes
| Need | Mode |
|---|---|
| Change the canonical canvas | `pen interactive -a desktop` (live attach, one writer, lock rules apply) |
| Read any file without touching the active document | copy the file to a scratch dir, then `pen interactive -i copy.pen -o scratch/out.pen < commands`, never `save()`; headless starts its own editor, needs no GUI, and the original is untouched |
| Parallel slices | headless per slice (`scripts/agent/pen-par/*`: slice, fanout, fanin), results applied by the single writer |
| Visual check | `TakeScreenshot([nodeId])` (sparingly), or `Export` png |

Reading `.pen` with Read/Grep is forbidden (encrypted). Reading another file through the desktop MCP would switch the user's active document: do not.

## Rules added 2026-10-25
- FOUNDER LOCKED / TIM-FINAL / CANONICAL in a name is provenance. The art director may change those masters for cohesion; keep the name in sync with status and note the change in the PR or design learning ledger. The CI notion of `founder-locked` in the conformance manifest is being relaxed by the Phase 2 program; until then do not weaken that gate yourself, raise it in the PR.
- The review copy, `canonical.lib.pen`, the Marketing Workspace and the App candidate files are all sources for consolidation; only the locked canonical pair is writable, and only by the one writer.
- Every Pen write batch ends with: `GetVariables`/component readback for what changed, `save()` on the attached canvas, mtime gate, then the registry audit when the registry changed.
- Measure: log batch start/end, node counts changed and, for agent-mode runs, the `--usage` JSON, keyed by PR or job id.
- Never keep per-task copies of the canonical file; scratch copies are deleted when the job ends.
