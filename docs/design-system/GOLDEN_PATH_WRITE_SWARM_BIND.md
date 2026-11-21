# Golden Path write-swarm bind (DES-21 / JOV-11623)

Author the three class-(a) missing Pen frames on Tim’s live canvas, then bind
real `penNodeId` values into `docs/pen-stills/golden-path/manifest.json`.
Agents must not invent node ids or rubber-stamp System-1.

## Blocker (cloud VM)

This cloud agent cannot reach the founder desktop Pen:

| Check | Result |
| --- | --- |
| `pen` CLI | not installed (`command not found`) |
| Canonical path | `~/Documents/Jovie/.../Jovie Design Studio — canonical.lib.pen` missing |
| Lock profile | `jovie-founder-design-studio` (see `scripts/agent/pen-workspace-locks.json`) |
| Headless draft secrets | `PEN_CLI_KEY` / `PEN_GOLDEN_PATH_FILE_URL` not available in this VM (GitHub Actions only) |

Until Tim attaches the live canvas (or a Mac agent with Pen + secrets runs),
manifest rows stay `pending-no-design`. Do not fake ids.

## Tim attach (live write)

```bash
# On Tim’s Mac, with the Design Studio canvas already open:
pen interactive -a desktop
# lock: jovie-founder-design-studio
# file: ~/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.lib.pen

node scripts/pen-review/run.mjs lease acquire --holder <you> --scope golden-path-missing-frames
# Author frames from briefs (compose from existing atoms; dark 1440):
#   docs/design-system/pen-briefs/homepage.md        → landing/homepage  route /
#   docs/design-system/pen-briefs/claim.md            → claim/claim       route /claim
#   docs/design-system/pen-briefs/billing-success.md  → checkout/billing-success  route /billing/success
node scripts/pen-review/run.mjs review --frames <ids>
# After quiet System-1: markReady → · ready for Tim r<receipt>
# save(); prove mtime via scripts/agent/PEN_LIVE_CANVAS.md
node scripts/pen-review/run.mjs lease release --holder <you> --token <token>
```

Write-swarm dry plan (no mutation from CI/cloud):

```bash
pnpm design:write-swarm:dry
node scripts/design-write-swarm/contract.mjs plan --live --holder tim \
  --scope golden-path-missing-frames --frames <id1>,<id2>,<id3>
```

## Bind scaffold (after real node ids exist)

```bash
node scripts/design/bind-golden-path-nodes.mjs --dry-run \
  --set landing/homepage=<id> \
  --set claim/claim=<id> \
  --set checkout/billing-success=<id>

node scripts/design/bind-golden-path-nodes.mjs \
  --set landing/homepage=<id> \
  --set claim/claim=<id> \
  --set checkout/billing-success=<id>
```

Rejects `pending-*`, empty, and malformed ids. Optional CI draft (does **not**
write canonical): `gh workflow run "Pen draft missing frames" -f only=homepage,claim,billing-success`.

## Next receipt

1. Live Pen author + System-1 pass on the three frames.
2. Persist + binder updates `manifest.json` (this PR’s scaffold).
3. Re-run Golden Path cert; expect `pen.design-exists` green for landing/claim/billing-success.
