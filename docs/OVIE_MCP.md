# Private Ovie MCP (ChatGPT)

`https://jov.ie/api/ovie/mcp` — Streamable HTTP JSON-RPC. OAuth 2.1 + PKCE at `/api/ovie/oauth`. Resource metadata: `/.well-known/oauth-protected-resource/api/ovie/mcp`. Founder session at authorize. Not `/api/mcp/{username}`.

Tools: `get_org_state`, `record_decision`, `create_initiative`, `get_initiative`, `get_feature_state`, `certify_feature`. Writes need founder token. No in-request worker spawn. Merged ≠ certified.

ChatGPT: Settings → Apps → Advanced → Developer mode → connector URL above. Sign in as `tim@meetjovie.com`.

Test: unauthenticated `initialize` → 401; founder `tools/list` → six tools.
