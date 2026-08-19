# Private Ovie MCP (ChatGPT)

`https://jov.ie/api/ovie/mcp` — Streamable HTTP JSON-RPC. OAuth 2.1 + PKCE at `/api/ovie/oauth`. Resource metadata: `/.well-known/oauth-protected-resource/api/ovie/mcp`. Founder session at authorize. Not `/api/mcp/{username}`.

Tools: `get_org_state`, `record_decision`, `create_initiative`, `get_initiative`, `get_feature_state`, `certify_feature`, `search_gbrain`, `get_gbrain_page`. Writes need founder token. gbrain tools are read-only. No in-request worker spawn. Merged ≠ certified.

Initiatives carry `confidence` (`high` | `medium` | `low`). `get_org_state` returns uncertified launch-critical profile capabilities plus a session handoff (`decisions`, `initiatives`, `open_questions`). `certify_feature` drafts a four-pass spec (author → adversary → execute+record failures → backfill real bugs). It does not run live money missions.

ChatGPT: Settings → Apps → Advanced → Developer mode → connector URL above. Sign in as `tim@meetjovie.com`.

Test: unauthenticated `initialize` → 401; founder `tools/list` → eight tools.
