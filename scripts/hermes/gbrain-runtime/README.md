# GBrain local runtime

These files define the shared GBrain HTTP transport on a Mac operator host.
They are deliberately **not** installed by either Hermes bootstrap script;
replacement is a separate, approval-gated operation.

## Ownership boundary

- `gbrain-serve-wrapper.sh` runs an installed, verified GBrain release binary.
  A source checkout is never treated as the deployed application.
- `gbrain-mcp-http-proxy.py` gives each MCP client a JSON-lines stdio bridge to
  the authenticated loopback endpoint; remote URLs are rejected. Token files
  deny group/other access, and `tools/call` is never retried because an
  interrupted write may have committed. A bounded worker pool, incremental SSE,
  absolute deadlines, byte limits, and JSON-RPC validation bound the transport.
  Provider URLs are parsed once over stdin, never process arguments.
- The plist template is a reviewable candidate for the future launchd unit. It
  is kept outside `launchd/` and `launchd/pro/` so no existing bootstrap command
  can activate it accidentally.
- Provider URLs and bearer tokens stay in operator-owned files under
  `~/.gbrain`; they must never be rendered into a plist, repository, or log.

### Service pool budget

The candidate preserves the observed daemon budget: read pool `3`, direct pool
`1`, total clamp `3`. The `2`/`1`/`15` policy in
`scripts/lib/gbrain-pool-env.mjs` is for overlapping short-lived CLI and sync
workers. Changing either requires an isolated pool test and provider receipt.

## Preconditions for activation

Do not install the candidate unit until all of the following have receipts:

1. the installed binary checksum matches a named upstream release;
2. a provider backup or point-in-time restore is visible to the owning account;
3. `gbrain doctor`, semantic query, write/readback, and MCP concurrency pass
   against an isolated restore or branch;
4. the current plist, wrapper, proxy, configuration, and token files have a
   permission-preserving backup;
5. the rendered candidate passes `plutil -lint` and binds only to loopback;
6. an operator has approved the exact plist label, binary, provider project,
   and maintenance window.

## Activation and rollback

Activation must be an explicit copy/render operation followed by a controlled
`launchctl bootout`/`bootstrap`; this directory intentionally provides no
one-shot installer. Preserve the previous unit under a timestamped directory.
Before bootstrap, inventory and boot out the exact prior service label, then
prove its process and listeners are gone. After bootstrap, require exactly one
`gbrain serve` process and exactly one approved listener; a port-conflict exit
is not a successful replacement receipt.

Rollback is equally explicit: boot out the candidate label, restore the exact
previous wrapper/proxy/plist/config files, bootstrap the previous plist, and
verify `/health`, an authenticated MCP `tools/list`, semantic query, and a
known-page read. A database-provider rollback is a different procedure and must
use a tested provider restore/PITR receipt rather than this service rollback.

The current daemon exposes `/health`; `/ready` is not a supported readiness
endpoint in the verified release.

`scripts/lib/__tests__/gbrain-runtime-assets.test.mjs` exercises the wrapper and
real loopback HTTP transport under the existing `ci:harness:test` selector.
