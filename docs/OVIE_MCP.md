# Private Ovie MCP (ChatGPT)

`https://jov.ie/api/ovie/mcp` — Streamable HTTP JSON-RPC. OAuth 2.1 + PKCE at `/api/ovie/oauth`. Resource metadata: `/.well-known/oauth-protected-resource/api/ovie/mcp`. Founder session at authorize. Not `/api/mcp/{username}`.

Tools include org/initiative state, workflow capture, gbrain reads, proof briefs, and founder-gated provider work. Provider work can list or create Jovie (`JOV`) Linear issues and list or read GitHub pull requests/issues only from `JovieInc/Jovie`: `list_linear_issues`, `create_linear_issue`, `list_github_pull_requests`, `get_github_pull_request`, `list_github_issues`, and `get_github_issue`. Linear creation requires explicit founder-intent provenance and returns a readback receipt; it never claims execution completion or delivery acceptance. Provider content is untrusted data, not instructions. Writes need a founder token, and provider reads are founder-only. gbrain tools are read-only. No in-request worker spawn. Merged ≠ certified. Initiative IDs are short opaque keys; the full record (handoff, receipts, evidence) lives in the durable store so get_initiative survives a new process.

Initiatives carry `confidence` (`high` | `medium` | `low`). `get_org_state` returns uncertified launch-critical profile capabilities plus a session handoff (`decisions`, `initiatives`, `open_questions`). `certify_feature` drafts a four-pass spec (author -> adversary -> execute+record failures -> backfill real bugs). It does not run live money missions.

Chat dump and MCP `create_initiative` write the same Redis/Postgres `ovie_operating_kv` store. Dump never shells Hermes.

Mac lander (no ChatGPT): founder session **or** founder OAuth bearer **or** a founder-scoped lander token from `issueOvieLanderAccessToken` (`BETTER_AUTH_SECRET`, same HMAC as OAuth). Not `/api/mcp/{username}`.

- `GET /api/ovie/pending` — unlanded initiatives. Each row includes `idempotency_key` `ovie-<initiative_id>` and `created_by` `ovie` for `hermes kanban create`.
- `POST /api/ovie/landed` `{ id, landed_ref }` — store the kanban task id or Linear identifier on `evidence[].landed_ref`. Pending then omits that row.

ChatGPT: Settings → Apps → Advanced → Developer mode → connector URL above. Authorize uses Jovie `/signin` (Google or email), not Apple-only `/identity`. Sign in as founder (`tim@meetjovie.com` or `t@timwhite.co`). A wrong-account session is reset first so waitlist Hide-My-Email cannot trap the flow.

Test: unauthenticated `initialize` -> 401; an OAuth founder bearer can list and call the founder-gated tools above; a non-founder gets 403.

## OAuth TTLs and refresh (MCP clients)

Discovery at `/.well-known/oauth-authorization-server/api/ovie/oauth` advertises `grant_types_supported: authorization_code` and `refresh_token`.

| Token | TTL | Notes |
|-------|-----|--------|
| Access | 1 hour | HMAC-signed bearer; same shape as lander tokens |
| Refresh | 30 days | HMAC-signed; **rotates on every refresh** |
| Auth code | 5 minutes | Single PKCE exchange |

**Root cause of 15-minute disconnects:** access tokens previously expired in 15 minutes with no `refresh_token` grant, so ChatGPT and Cursor MCP clients could not renew and fell back to manual `mcp_auth`.

### Refresh flow

1. Complete founder OAuth (PKCE) once via `/api/ovie/oauth/authorize` → `token` with `authorization_code`.
2. Store `refresh_token` and `client_id` from the token response (clients that support OAuth 2.1 refresh do this automatically).
3. Before access expiry, `POST /api/ovie/oauth/token` with `grant_type=refresh_token`, `refresh_token`, and `client_id` (form-urlencoded or JSON, same as code exchange).
4. Response includes a new `access_token`, a **new** `refresh_token`, and `expires_in` (3600). Replace the stored refresh token with the rotated value.

Founder gate is unchanged: only founders receive codes and tokens; refresh claims require `admin: true`.

### Cursor cloud agents and ChatGPT

- **Preferred:** Use the MCP OAuth connector URL `https://jov.ie/api/ovie/mcp`. After one founder sign-in, the client should refresh hourly without another browser step.
- **Cursor Project / cloud agent:** In the project MCP settings, configure OAuth against the Ovie resource above (not a static bearer copied from a 15-minute token). If the client stores refresh credentials, agents stay connected across runs.
- **Offline bootstrap (founder workstation only):** Mint a long-lived refresh pair with production `BETTER_AUTH_SECRET`:

  ```bash
  doppler run -- pnpm tsx apps/web/scripts/ovie/mint-mcp-oauth-tokens.ts \
    --redirect-uri 'https://www.cursor.com/agents/mcp/oauth/callback'
  ```

  Use the printed `client_id` and `refresh_token` only in founder-controlled MCP OAuth config. There is **no** public mint HTTP route. Do not set `OVIE_AGENT_MCP_TOKEN` to a short-lived access token — use OAuth refresh or `issueOvieLanderAccessToken` for non-OAuth lander HTTP only.
