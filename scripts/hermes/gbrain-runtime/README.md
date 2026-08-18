# GBrain local runtime

These files are the repository-owned definition of the shared GBrain HTTP
transport on a Mac operator host. They are deliberately **not** installed by
either Hermes bootstrap script yet: replacing a live database-backed service is
a separate, approval-gated operation.

## Ownership boundary

- `gbrain-serve-wrapper.sh` runs an installed, verified GBrain release binary.
  A source checkout is never treated as the deployed application.
- `gbrain-mcp-http-proxy.py` gives each MCP client a JSON-lines stdio bridge to
  the shared authenticated loopback endpoint. Remote URLs require an explicit
  opt-in, token files must deny group/other access, and `tools/call` is never
  retried automatically because it may have committed a write before an
  ambiguous transport failure.
- The plist template is a reviewable candidate for the future launchd unit. It
  is kept outside `launchd/` and `launchd/pro/` so no existing bootstrap command
  can activate it accidentally.
- Provider URLs and bearer tokens stay in operator-owned files under
  `~/.gbrain`; they must never be rendered into a plist, repository, or log.

### Service pool budget

The candidate deliberately preserves the observed long-lived daemon budget:
read pool `3`, direct pool `1`, total connection clamp `3`, with the direct pool
enabled. This is different from `scripts/lib/gbrain-pool-env.mjs`, whose
`2`/`1`/`15` single-pool policy is for overlapping short-lived CLI and sync
workers. The daemon keeps one direct connection available for GBrain operations
that require the direct URL while placing a lower total bound on its persistent
process. Changing either policy requires an isolated pooled-connection test and
a fresh provider connection-budget receipt.

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

Rollback is equally explicit: boot out the candidate label, restore the exact
previous wrapper/proxy/plist/config files, bootstrap the previous plist, and
verify `/health`, an authenticated MCP `tools/list`, semantic query, and a
known-page read. A database-provider rollback is a different procedure and must
use a tested provider restore/PITR receipt rather than this service rollback.

The current daemon exposes `/health`; `/ready` is not a supported readiness
endpoint in the verified release.

The corresponding automated contract is
`scripts/lib/__tests__/gbrain-runtime-assets.test.mjs`. It executes the wrapper
against a fake release binary and the proxy against a real loopback HTTP server,
including transient retry, SSE parsing, bearer forwarding, and deterministic
authentication failure behavior. It is collected by the repository's existing
`ci:harness:test` selector.
