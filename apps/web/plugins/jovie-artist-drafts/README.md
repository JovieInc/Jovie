# Jovie for Artists plugin package

Portable listing files for the ChatGPT plugin directory. The MCP server is
`https://jov.ie/api/mcp`, the anonymous artist-acquisition endpoint
(`artist.search_or_import`, `workspace.create_draft`, `release.prepare_launch`).
It is live in production behind the `AGENT_PROFILE_CREATE` abuse stop control;
no listing-specific flag exists and none is needed.

Zip this directory so `plugin.json` is at the archive root, together with
`mcp.json`, `README.md`, and `assets/`. Do not add a parent folder, secrets,
reviewer passwords, or a demo recording URL.

The go-condition, submission steps, review test cases, the seeded review
account, and the over-trigger eval are in
[docs/integrations/chatgpt-app-directory.md](../../../../docs/integrations/chatgpt-app-directory.md)
under "Artist app: Jovie for Artists". Do not upload this package from CI.
