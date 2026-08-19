# Private Ovie MCP (ChatGPT)

`https://jov.ie/api/ovie/mcp` — Streamable HTTP JSON-RPC. OAuth 2.1 + PKCE at `/api/ovie/oauth`. Resource metadata: `/.well-known/oauth-protected-resource/api/ovie/mcp`. Founder session at authorize. Not `/api/mcp/{username}`.

Tools: `get_org_state`, `record_decision`, `create_initiative`, `get_initiative`, `get_feature_state`, `certify_feature`, `search_gbrain`, `get_gbrain_page`. Writes need founder token. gbrain tools are read-only. No in-request worker spawn. Merged ≠ certified. Initiative IDs are compact signed claims so ChatGPT can pass them back; they are not the full record blob.

ChatGPT: Settings → Apps → Advanced → Developer mode → connector URL above. Authorize uses Jovie `/signin` (Google or email), not Apple-only `/identity`. Sign in as founder (`tim@meetjovie.com` or `t@timwhite.co`). A wrong-account session is reset first so waitlist Hide-My-Email cannot trap the flow.

Test: unauthenticated `initialize` → 401; founder `tools/list` → six tools.
