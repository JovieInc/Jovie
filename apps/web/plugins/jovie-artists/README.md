# Jovie artists plugin package

Portable listing files for the ChatGPT plugin directory. The MCP server is
`https://jov.ie/api/chatgpt/mcp`. It stays off until
`FEATURE_CHATGPT_APP_DIRECTORY_MCP=true` is set in production and the app is
redeployed.

Zip this directory so `plugin.json` is at the archive root, together with
`mcp.json`, `README.md`, and `assets/`. Do not add a parent folder, secrets,
reviewer passwords, or a demo recording URL.

Submission steps, the requirement map, and the production flag are in
[docs/integrations/chatgpt-app-directory.md](../../../docs/integrations/chatgpt-app-directory.md).
Do not upload this package from CI.
