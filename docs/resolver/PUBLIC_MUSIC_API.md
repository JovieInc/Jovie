# Public music resolve contract

The anonymous public music resolver is available at `POST /api/v1/music/resolve`.
Its input, output and failure schemas are published in the existing
[`/api/v1/openapi.json`](https://jov.ie/api/v1/openapi.json) document. The REST
resource and MCP `resolve` tool share validation, resolver execution and facts.
The namespace preserves existing `/api/v1/{username}` public profile reads.

This is the single music lookup slice of JOV-7830. Canonical persisted revisions,
field assertions/history, batch and durable jobs, discovery pagination, generated
SDKs, tenant credentials and spend authorization remain commissioning work in
JOV-8745 under JOV-7830, dependent on JOV-7825/JOV-7826 and the JOV-7822 capability matrix. It does
not certify three-vendor parity. Public paid access retains its separate gates.

Send JSON with `Content-Type: application/json`. `kind` defaults to `artist`.

| Buyer outcome | Request | Meaning |
| --- | --- | --- |
| Resolve a known artist | `{"input":"51972833-bb04-46b7-9401-45a5ab449ebd"}` | Exact MusicBrainz artist ID; supported HTTPS artist URLs also work. |
| Find a namesake safely | `{"input":"Tim White"}` | Returns real candidates when ambiguous. Resubmit the chosen candidate's exact URL; never select by confidence alone. |
| Resolve a recording | `{"kind":"track","input":"Karma Police","artist":"Radiohead","territory":"GB"}` | Track URL or ISRC can replace title/artist. Territory is a two-letter country code. |
| Resolve an album | `{"kind":"album","input":"OK Computer","artist":"Radiohead"}` | Album URL or 12–14 digit UPC can replace title/artist. |

`territory` and `artist` are rejected for artist resolution. Other unknown fields
are rejected: `fields`, acceptable age, wait budget, idempotency keys and maximum
charge are not silently accepted. Reads create no profiles, claims or publications
and authorize no charges or private tenant access. Existing public provider
projections apply; this endpoint adds no source fields.

`resolved`, `no_match` and `ambiguous` return HTTP 200 with the domain object
directly. Results include links and provenance, real candidates and available
MusicBrainz metadata. Missing identifiers remain null. The existing aggregate
confidence is a heuristic, not calibrated assurance. Embedded release groups can
be incomplete (`releaseGroupsComplete`). These provider IDs are not persisted
canonical entity IDs; response confidence is not identity or account ownership.

Failures return `{"error":{"code":"UPSTREAM_FAILURE","retryable":true}}`.
HTTP 400 covers invalid JSON/input, 403 denied Origin, 408 body timeout, 413 body
size, 415 media type, 429 IP quota, 499 caller cancellation, 502 upstream failure,
503 quota-store unavailability and 504 provider timeout. Failures disclose no
provider error text or input excerpts. Transient failures include `Retry-After`.
Every response has a server-generated `X-Request-Id`, v1 policy `Link`, quota
policy and `Cache-Control: no-store`; remaining/reset headers appear when the
durable quota store is available. The shared public-artist quota is 100 requests
per IP per 60 seconds. Body size is 16,384 bytes; body reads have 5 seconds and
provider work has 45 seconds. Disconnecting cancels provider work.

Retries can repeat upstream reads and return newer provider facts. There is no
durable replay snapshot or asynchronous poll/cancel resource in this slice.

Run the TypeScript example from the repository root:

```sh
pnpm exec tsx apps/web/scripts/examples/music-resolve.ts '51972833-bb04-46b7-9401-45a5ab449ebd'
```

The example imports the same Zod schemas for request and response validation.
The Python example uses only the standard library (Python 3.9+):

```sh
python3 apps/web/scripts/examples/music-resolve.py '51972833-bb04-46b7-9401-45a5ab449ebd'
```

Both call the production resource and print actual JSON; they do not provide
fixtures or automatic retry loops. Run them after the implementing commit is
deployed. Their local compatibility tests are not a deployment receipt.

For an existing `jovie music resolve '<input>' --json` or MCP integration, preserve
the same request fields. REST HTTP failures correspond to MCP
`result.structuredContent.error`, while REST domain results equal MCP
`structuredContent` and CLI JSON directly. The CLI continues to use the existing
MCP transport. Transport presence does not prove semantic parity with Musicfetch,
Chartmetric or Social Blade. Migrate buyer workflows using the JOV-7822 matrix;
do not translate proprietary metrics or promise drop-in vendor compatibility.
