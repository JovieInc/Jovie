# MCP binding contract (contract-only)

Status: **contract-only**. No MCP runtime exposes canonical actions today.

## Hard boundary

The public per-artist MCP endpoint
(`apps/web/app/api/mcp/[username]/route.ts`) is **read-only for workspace
data and never accepts canonical write actions**. This binding applies only
to a future authenticated, owner-workspace MCP server.

## Mapping

- Each action maps to one MCP tool named exactly after the action ID
  (`chat.start`, `contact.create`, `release.create`, `task.create`).
- Tool `inputSchema` is the generated JSON Schema
  (`generated/schemas/<id>.input.json`) verbatim — never a hand-kept copy.
  The current merch tools' hand-synced JSON/zod pairs are the anti-pattern
  this contract replaces.
- Tool results carry the canonical envelope as structured content:
  `{ ok, data|error, meta }`. JSON-RPC protocol errors are reserved for
  transport failures; domain failures are always `ok: false` results with a
  structured `error.code`.
- Auth: OAuth/API-key owner-workspace session (to be designed in the
  dispatcher phase); every call resolves to one profile scope. Anonymous or
  fan-scoped sessions receive `UNAUTHENTICATED`.
- Idempotency: `idempotencyKey` is a required tool argument. MCP clients
  retrying a call must reuse the key.
