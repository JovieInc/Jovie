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
- Context ownership: `profileId`, `channel` (`mcp`), `clientVersion`, and the
  top-level `idempotencyKey` belong to the invocation envelope the adapter
  builds, not the tool's domain arguments. `idempotencyKey` is a required
  tool-level argument; MCP clients retrying a call must reuse the key.
- Tool results carry the canonical `ActionResult` as structured content: the
  six-status union (`completed`, `handoff`, `requires_input`, `in_progress`,
  `unavailable`, `failed`), each with its `ActionReceipt`. JSON-RPC protocol
  errors are reserved for transport failures; domain outcomes are always
  `unavailable`/`failed` results whose structured error retains the stable
  `error.code` in `error.data`. Callers branch on the code, never on message
  text.
- `chat.start` returns a `handoff` result with semantic target `chat.new`;
  the MCP client maps that to an appropriate client link. It is a navigation
  handoff: no empty conversation is created or persisted, and no message
  quota is consumed.
- Auth: OAuth/API-key owner-workspace session (to be designed in the
  dispatcher phase); every call resolves to one requested profile scope that
  the server must prove is owned. Anonymous or fan-scoped sessions receive
  `AUTH_REQUIRED` / `PROFILE_REQUIRED`.
