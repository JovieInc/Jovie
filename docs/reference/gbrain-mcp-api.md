# gbrain MCP API Reference

gbrain exposes an MCP (Model Context Protocol) server over HTTP with SSE
(Server-Sent Events) streaming. The server runs on port `:7801` by default
and is registered with OpenClaw as a streamable-http MCP server.

## Connection

- **Base URL:** `http://127.0.0.1:7801` (configurable via `GBRAIN_API_URL`)
- **Auth:** Bearer token in the `Authorization` header (`GBRAIN_API_KEY`)
- **Headers:**
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`

Example:

```bash
curl -N -X POST "$GBRAIN_API_URL/mcp" \
  -H "Authorization: Bearer $GBRAIN_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"page/list","arguments":{"limit":10}}}'
```

## MCP Endpoint

`POST /mcp` — Standard MCP protocol endpoint. All operations go here as
JSON-RPC 2.0 requests (`tools/list`, `tools/call`, etc.).

## Available Tools

### page/list

List pages with sorting and limits.

**Arguments:**

| Argument | Type   | Description                                      |
| -------- | ------ | ------------------------------------------------ |
| `limit`  | number | Max number of pages to return                    |
| `sort`   | string | Sort order (e.g. most recently updated first)    |

Returns page summaries (slug, title, type, timestamps) — not full content.
Use `page/get` to fetch a page body.

### page/get

Get a single page by slug.

**Arguments:**

| Argument | Type   | Description               |
| -------- | ------ | ------------------------- |
| `slug`   | string | The page slug to retrieve |

The canonical page content is in the `compiled_truth` field (there is no
`body` field). Pages also carry `timeline`, `frontmatter`, and tag metadata.

### search/query

Search pages using hybrid retrieval (keyword full-text + vector similarity).

**Arguments:**

| Argument | Type   | Description                        |
| -------- | ------ | ---------------------------------- |
| `query`  | string | Natural-language or keyword query  |
| `limit`  | number | Max number of results (optional)   |

Results are ranked by a fused keyword/vector score and include the matching
page slug plus relevant chunk excerpts.

## Response Format

Responses stream back as SSE. Response lines look like:

```
event: message
data: {"result": {"content": [{"type": "text", "text": "..."}]}}
```

To consume a response: read `data:` lines, JSON-parse the payload, and pull
tool output from `result.content[].text`.

## Health Check

`GET /health` — Returns OK with version info. No auth required. Used by the
gate script to verify the server is up before registering it as an MCP
provider.
