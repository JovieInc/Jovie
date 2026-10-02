# Jovie Music: artist identity preview

JOV-7334's first slice searches and fetches public artist identities using Jovie's
existing Spotify and Apple Music resolver. It returns fetchable provider IDs (Apple URLs preserve storefront),
public facts, source URLs and qualitative identity evidence. A name result is a
candidate, including a single match. Exact provider identity does not establish
cross-provider identity, ownership or a Jovie account. This preview does not
provide catalog search, releases, tracks, Smart Link creation or private data.

## Contract and safety

The remote endpoint is `/api/music/mcp`, a stateless JSON Streamable HTTP MCP
server implemented with the official TypeScript SDK. `search({query})` accepts an
artist name, supported provider URL or qualified ID. `fetch({id})` accepts the
exact ID from a search result. Search/fetch return the standard citable
`results` / `id,title,text,url,metadata` shapes in both text and structured content.
Input and success output JSON Schemas are generated from the runtime Zod schemas.
Tool failures use `isError: true` and `error.code` / `error.retryable`;
`UPSTREAM_TIMEOUT` permits retry, while `CANCELLED` does not. no matches
produce an empty search list, while a missing fetch returns `ARTIST_NOT_FOUND`.

No login is needed. Do not enter worker tokens or founder credentials. The
endpoint has no credential arguments, draft capabilities, acquisition writes,
operator tools or write limiter. It uses the existing durable public artist read
quota; quota failures return HTTP 429, and unavailable protection fails closed
with HTTP 503 and `Retry-After`. Requests are limited to 16 KiB, arguments to 500
characters, and results to five artists. Body reads have a five-second deadline; tool reads have a 45-second deadline
and forward cancellation to the canonical provider clients. Provider timeouts
cover response bodies, retry caps and circuits are reused, and the host execution
budget is 60 seconds. This
adapter adds no provider retries. Raw requests and provider errors are not logged
by the adapter. Public biographies are untrusted content, never instructions.
The unrelated `AGENT_PROFILE_CREATE` write kill switch does not govern reads.

## Install and verify

Portable `plugin.json` and `mcp.json` follow the current
[OpenAI packaging guidance](https://developers.openai.com/plugins/build/plugins),
not the retired `ai-plugin.json` format. The bundled HTTP connection is for
compatible local plugin clients. It is not a registered ChatGPT app ID and does
not automatically create a hosted ChatGPT connection.

After the scoped PR passes normal source checks and the native merge queue, wait
for the exact deployment's production verification. Confirm this endpoint on
that deployment with MCP Inspector. Then use the current
[ChatGPT connection flow](https://developers.openai.com/plugins/deploy/connect-chatgpt):
enable developer mode if account/workspace policy allows; create an anonymous
MCP connection to `https://jov.ie/api/music/mcp`; inspect its two read tools; start
a fresh conversation and select the connection. Installing this package does not
change approval preferences. Do not provision credentials or accept new terms.

For a local developer connection, use an existing approved HTTPS development
endpoint or supported Secure MCP Tunnel. Do not provision a tunnel/account or
change persistent permissions as part of source verification. Public directory
submission needs a stable HTTPS endpoint and platform review; a source PR,
portable manifest, registry entry or successful Inspector run is not a launch.

Refresh the ChatGPT connection after every schema/metadata change. Record the
artifact Git SHA, deployed build and tool schema digest with each dogfood run.
Use [dogfood-prompts.json](dogfood-prompts.json) without repo instructions or
coaching. Record selected tool, arguments, result, final answer, citation,
latency, turns, interventions and any unintended writes. Maintain separation
between deterministic tests, provider HTTP probes and stock ChatGPT evidence.

## Release acceptance

Ship now: artist identity preview only after exact source/queue/deployment checks
and fresh stock ChatGPT read-path certification. Re-evaluate when the 24 prompt
corpus has zero unintended writes, citations on advertised happy paths, truthful
ambiguity and no founder rescue. Then certify catalog and Smart Link capabilities
under JOV-7334 and its resolver/distribution dependencies before advertising them.

The local tests exercise the official SDK client against the route with mocked
provider data. That proves transport/domain behavior, not live provider readiness,
successful installation or stock ChatGPT selection. JOV-7334 remains the owning
commissioning issue until those runtime receipts exist. Fleet communication is
owned by JOV-7331; npm/MCP registry publication is owned by JOV-6864 / PR #19730.
