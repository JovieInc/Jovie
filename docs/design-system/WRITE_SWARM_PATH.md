# Design write swarm path (JOV-13851)

Atomic Pen + code path: **lease → System-1 panel → Tim-ready rename → code sync**.
Never invent-and-rubber-stamp in one agent.

## Tim watch canvas (attach)

- **Lock profile:** `jovie-founder-design-studio`
  (`scripts/agent/pen-workspace-locks.json`)
- **Canonical file:**
  `~/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.lib.pen`
- **Attach (canvas already open):** `pen interactive -a desktop`
  — see `.claude/rules/pen.md` and `scripts/agent/PEN_LIVE_CANVAS.md`.
- Cloud VMs without that desktop: run **dry/contract** only; do not invent Pen
  mutations or a second file (`--out`, `save({path})`).

## Steps

1. **Attach** live canvas (above).
2. **Lease** —
   `node scripts/pen-review/run.mjs lease acquire --holder <you> --scope <slice>`.
3. **Mutate** one atomic slice under the lease token.
4. **System-1** —
   `node scripts/pen-review/run.mjs review --frames <ids>` (panel in
   `scripts/pen-review/judges.mjs`). Writer self-verdict is not System-1.
5. **Tim-ready** — only after quiet System-1 rounds; frame renamed
   `· ready for Tim r<receipt>`.
6. **Persist** — `save()` then mtime gate (`PEN_LIVE_CANVAS.md`).
7. **Code sync** — small PR for tokens / `packages/ui` / bindings; **no** `*.pen`
   blobs (see data-backed ship path when present).
8. **Release** lease.

## Machine recipe

```bash
pnpm design:write-swarm:list
pnpm design:write-swarm:dry          # plan; mutatesPen=false
pnpm design:write-swarm:test         # contract proof
node scripts/design-write-swarm/cli.mjs plan --live --holder you --scope chip --frames abc123
node scripts/design-write-swarm/cli.mjs validate --receipt path/to/receipt.json
```

Schema `jovie.design-write-swarm/v1` —
`scripts/design-write-swarm/contract.mjs`.
