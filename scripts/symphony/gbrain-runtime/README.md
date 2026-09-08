# GBrain local runtime

Repository-owned candidate for the shared GBrain HTTP transport on a Mac operator host. It is **not** installed by Hermes bootstrap scripts; live replacement remains approval-gated.

## Boundaries

- `gbrain-serve-wrapper.sh` runs an installed release binary, not a checkout.
- `gbrain-mcp-http-proxy.py` bridges MCP stdio to authenticated loopback HTTP, rejects remote URLs, validates token-file permissions, avoids `tools/call` replay, and bounds workers, SSE, deadlines, bytes, and JSON-RPC.
- The plist stays outside `launchd/` and `launchd/pro/`; bootstrap commands cannot activate it accidentally.
- Provider URLs and bearer tokens stay under `~/.gbrain`, never in repo, plist, process arguments, or logs.

Activation stays manual: install only after receipts prove release checksum, backup/PITR, isolated `doctor`/query/write/readback/MCP concurrency, `plutil -lint`, loopback-only binding, and operator approval. Rollback restores prior wrapper/proxy/plist/config and verifies `/health`, MCP `tools/list`, semantic query, and known-page read.
