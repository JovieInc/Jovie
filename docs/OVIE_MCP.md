# Private Ovie MCP (ChatGPT)

Streamable HTTP MCP for Tim → ChatGPT → Ovie. Not the public artist MCP.

## Connection

- **URL:** `https://jov.ie/api/ovie/mcp`
- **Transport:** Streamable HTTP (JSON-RPC `initialize`, `tools/list`, `tools/call`)
- **Auth:** OAuth 2.1 + PKCE
  - Protected resource: `https://jov.ie/.well-known/oauth-protected-resource/api/ovie/mcp`
  - Authorization server: `https://jov.ie/api/ovie/oauth`
  - Register: `POST https://jov.ie/api/ovie/oauth/register`
  - Authorize: `GET https://jov.ie/api/ovie/oauth/authorize` (founder Better Auth session)
  - Token: `POST https://jov.ie/api/ovie/oauth/token`
- **Identity:** Ovie founder pack. Artist tools live at `/api/mcp/{username}`.

## Tools

`get_org_state`, `record_decision`, `create_initiative`, `get_initiative`, `get_feature_state`, `certify_feature`.

Writes require a founder-authorized token. `create_initiative` acks and persists; it does not spawn a worker. Merged code is not complete or certified.

## ChatGPT

Settings → Apps → Advanced → Developer mode → add connector URL `https://jov.ie/api/ovie/mcp`. Sign in as `tim@meetjovie.com` when prompted.

## Minimal connectivity test

`POST /api/ovie/mcp` `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}` without Authorization → 401. With a founder access token, `tools/list` returns the six tools.
