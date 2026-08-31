# Official Symphony adaptive routing rollout

This is a production configuration change even though it only changes the
repo-owned workflow and launcher.

## Preconditions

1. Run the exact Node route and shadow-launch tests plus the official Burrito
   workflow contract test and the Gem HUD test.
2. Merge through required hosted CI. Do not bypass or weaken any gate.
3. Use `update-symphony-burrito.sh --skip-binary --no-restart` so existing
   workers keep their current app-server. Never restart the active service only
   to apply routing.

## Readback

After the workflow reloads naturally, start one new low-risk Todo and one
verification-evidence Todo. Read `.symphony-official-route.json` in each new
workspace and confirm Luna/low and Terra/high respectively. Confirm the process
arguments match the receipt without reading any credential file. Then verify
the official `/api/v1/state` endpoint, worker count, retry count, host CPU,
memory, I/O pressure, and available slots remain within the pre-change cohort.

The no-downgrade floor is stored under
`~/.local/state/jovie-symphony/routes/`, outside agent workspaces. Workspace
receipts are readback copies only; a task cannot lower its next route by
editing one.

Capacity telemetry is non-secret input. When it reports at least 90% used or at
most 10% remaining, the launcher emits `multi-account-routing-required`; it
does not inspect, create, rotate, or choose credentials.

## Rollback

Restore `codex.command` to `codex app-server` and remove the `before_run` route
preparation hook, then copy the workflow with `--skip-binary --no-restart`.
Existing workers are left alone; only later workers return to the configured
Codex default. Read back the live workflow and `/api/v1/state` after rollback.
