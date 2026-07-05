# gbrain Migration to Supabase + HTTP API

## Problem
gbrain ran on PGLite (in-process Postgres) which required spinning up a fresh database
and running 114 migrations every invocation. CLI startup was 4.3s per call.
The HTTP API didn't exist — every tool call went through the CLI.

## Solution

### Engine change
Changed `engine: pglite` → `engine: postgres` in gbrain config.
This points the CLI directly to Supabase Postgres. Zero migration overhead on startup.

### Embedding model
- Provider: openai-compatible via Vercel AI Gateway
- Model: `openai/text-embedding-3-small`
- URL: `ai-gateway.vercel.sh/v1`

### HTTP API
Added gbrain HTTP server on `:7801` with:
- `/health` — 32ms fast path (was 2.1s CLI)
- `/v0/search` — keyword/vector hybrid
- `/v0/page/{slug}` — page retrieval
- `/mcp` — SSE streamable MCP endpoint (81 tools, Bearer auth)

### Performance
- CLI-to-Supabase: 4.3s (identical to PGLite, but no migration tax)
- HTTP API: 11ms (390× faster than CLI)
- Health check: 32ms vs 2.1s CLI

### MCP Registration
Registered with OpenClaw as streamable-http MCP at `:7801/mcp`.
81 tools exposed. Bearer auth with `MCP_GBRAIN_API_KEY`.