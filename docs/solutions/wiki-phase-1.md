# Wiki Phase 1 — gbrain-backed Company Wiki

## Problem
Jovie had no integrated documentation viewer. All knowledge lives in gbrain
(Postgres + Supabase) but was only accessible via CLI or MCP. The /hud surface
had no wiki view.

## Solution
12 files, 312 insertions:
- `lib/wiki/gbrain-client.ts` — server-only MCP client with SSE parsing,
  `{ok, data}` / `{ok: false, reason}` pattern for graceful degrade
- `app/hud/wiki/page.tsx` — admin-gated index with namespace-grouped listing
- `app/hud/wiki/[...slug]/page.tsx` — admin-gated page view
- 5 UI components (SearchForm, NamespaceSection, SearchResults, PageArticle,
  UnavailableNotice)
- Env config: `GBRAIN_API_URL`, `GBRAIN_API_KEY` added to env schema

## Key decisions
- Server components only (no client state)
- gbrain MCP via HTTP POST + SSE parsing (no client SDK)
- Graceful degrade: wiki shows "not configured" when gbrain unreachable
