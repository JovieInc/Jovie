# `@jovie/cli`

Jovie for AI agents. One package is a CLI, an MCP server, and an agent skill.
An agent can extract public creator data from a supported social URL or give a
music artist a Jovie profile from Spotify, then hand the artist a claim link.
No login or API key is required.

## Install

Requires Node.js 24.21 or newer (tested on 24 and 26; Node 22.13+ also runs,
without proxy support). Install an exact public release globally from npm:

```sh
npm install --global @jovie/cli@26.9.16
jovie --help
jovie --version
```

Or run without installing: `npx -y @jovie/cli@26.9.16 --help`.

Use `npm view @jovie/cli version` to confirm registry availability before an
automated install. A repository build is not proof that npm has the package.

## Commands

| Command | Request |
| --- | --- |
| `creator lookup <url>` | `GET /api/agents/creator-lookup`; supports YouTube channels, Instagram profiles, TikTok profiles, and Linktree |
| `profile create <url>` | `POST /api/agents/profiles` with a Spotify artist URL |
| `artist get <username>` | `GET /api/v1/{username}` |
| `artist llms <username>` | `GET /{username}/llms.txt` |
| `api openapi` | `GET /api/v1/openapi.json` |
| `docs llms` | `GET /llms.txt` (`--full` for `/llms-full.txt`) |
| `report bug\|feedback --title <text> --details <text>` | `POST /api/agents/feedback`; returns `reportId` |
| `mcp` | Serve the commands above as MCP tools over stdio |
| `init` | Install `jovie/SKILL.md` into each installed agent (Claude, Codex, OpenClaw, Hermes) |
| `skill` | Print the skill |

`profile create` returns the existing profile unchanged when one already holds
that Spotify artist. Otherwise it creates an unclaimed profile. The response
has `profileUrl` and, when unclaimed, a `claimUrl`. The claim URL is not an
ownership token: the artist still verifies that they own the Spotify artist.
Creation is anonymous and rate limited per IP.

`creator lookup` is read-only. It returns the display name, bio, avatar URL,
and public links extracted by the existing ingestion strategy without creating
or changing a Jovie profile.

`--json` emits JSON for API responses and wraps text resources as
`{"content":"..."}`. Failures print `{"error":{...}}`, and API failures carry
the server's stable `apiCode` (for example `RATE_LIMITED`). Successful commands
exit `0`, request/response failures exit `1`, and invalid usage exits `2`.

`--help --json` returns `{ "content": "..." }`; `--version --json` returns `{ "version": "..." }`.

Reads make up to three attempts with backoff for transient failures (connection
resets, 502 without an error code, 503, 504, and 429 with `Retry-After` of 5 seconds
or less). A longer `Retry-After` is reported, not slept through. Writes never retry
automatically: a timeout may have occurred after the server committed. Report tools
therefore do not advertise idempotency. Every attempt, backoff, and body read share
one 30-second deadline, so no command waits longer. Bodies are capped at 1 MiB.

Errors are one line on stderr that says what to do next (for example
`Could not resolve jov.ie. Check your internet connection or --base-url.`). Add
`--debug` to also print the stack and cause chain; secrets are redacted either way.
Closing the output pipe early (`jovie docs llms | head`) exits quietly.

Every command accepts `--base-url <url>` for a compatible deployment origin.
The value must be an `http` or `https` origin without a path, credentials, or
query parameters.

## Proxies

The standalone CLI and MCP server honor `HTTP_PROXY`, `HTTPS_PROXY`, and
`NO_PROXY` (and their lowercase equivalents) through Node's built-in proxy
support on Node.js 24 and newer (Node 22 warns and connects directly). No extra
Node flags are needed. Existing TLS certificate settings
remain in effect. A proxy must allow the deployment host (normally `jov.ie`);
installing the CLI does not grant network access.

Importing the JavaScript client does not change the host application's global
transport settings. Configure Node's proxy support in that application or pass
`fetchImpl` through the client options.

## MCP

```json
{ "mcpServers": { "jovie": { "command": "npx", "args": ["-y", "@jovie/cli", "mcp"] } } }
```

Tools: `lookup_creator`, `create_profile`, `get_artist`, `get_artist_guide`, `get_openapi`,
`get_docs`, `report_issue`, `report_feedback`. `server.json` describes the package for the MCP registry.

## JavaScript client

```js
import { createProfile, fetchArtist, lookupCreator } from '@jovie/cli';

const creator = await lookupCreator('https://www.youtube.com/@creator');
const profile = await createProfile('https://open.spotify.com/artist/<id>');
const artist = await fetchArtist('artist-username');
```

## Boundary

Public commands send no credentials, cache nothing, and send no telemetry beyond a
`jovie-cli/<version>` User-Agent. `profile create` and `report` are their only writes. Reports carry only the CLI
version, platform, runtime, and the fields you pass. `init`
writes only `jovie/SKILL.md` into existing agent skill directories, or into
`--dir`. Commands use Node 24 built-ins (`parseArgs`, `fetch`, `readline`) and
have no runtime dependencies. Internal fleet commands have the separate scoped
credential boundary below. The MCP server covers tools only; adopt the
official SDK when resources, prompts, or HTTP transport are needed.

The repo already supplies Node 24's `node:util.parseArgs`, built-in `fetch`,
`AbortSignal.timeout`, TypeScript, Vitest, and Biome. Internal fleet commands use
the same canonical Actions contract as their REST and MCP transports.

We considered Commander/CAC (MIT, no runtime dependency), yargs (MIT but
larger), oclif (extensible but disproportionate), and Python Click/Typer or
Homebrew (a second runtime/distribution lane). None fits this fixed-command,
TypeScript-only surface as well as the native substrate.

Decision: retain one dependency-free Node 24 CLI for public product commands and
scoped internal fleet commands. Ovie remains the operator view of the same system.

## Internal fleet channel

These commands require a deployed fleet transport, operator enablement, and an
individually provisioned worker identity. Installing this package does not
register an agent or grant company access. Public product sessions cannot
authorize fleet operations.

| Command | Purpose |
| --- | --- |
| `fleet register` | Advertise capabilities and availability within provisioned authority |
| `fleet status` | Read this worker's current lease, requests and terminal receipts |
| `fleet directory` | Discover attested peers permitted by the worker's visibility scope |
| `work request` | Propose bounded help, dogfood or research work; grants no execution authority |
| `work next` | Receive a compatible admitted offer |
| `work claim` | Claim that offer before it expires |
| `work report` | Persist the terminal outcome and evidence |
| `defect report` | Deduplicate an evidenced defect through the canonical Linear adapter |

Every command requires `--profile <provisioned-profile-uuid>`,
`--idempotency-key <stable-invocation-key>`, and `--input '<canonical-json>'`.
Use a new key for each new invocation; reuse the exact key and payload only to
recover the same invocation. A repeated registration key replays the original
registration; it is not a presence refresh.

`fleet status` returns a bounded recent view plus durable terminal history.
Pass `{"historyAfter":0,"historyLimit":50}` in `--input` for the first page;
use `history.nextCursor` for subsequent pages, with a new invocation key for
each page. Save the last entry's `sequence` to resume when more outcomes arrive.
Pages respect both the requested item limit (1–100) and a response byte budget.
`history.pending` means older hot records still need bounded archival; another
status call continues that work. Every outcome remains durable during migration.
Large current request lists also expose `requestsNextCursor`; pass it back as
`requestsAfter`. Terminal request outcomes and receipts remain available in
history after leaving the recent view. History is scoped to this worker and
profile, including after credential rotation.

The founder status endpoint can inspect history with
`history: {workerId, after?, limit?}` after the existing session/owned-profile
checks. Its `historyWorkers` inventory lists workers with recorded history.
Archival preserves invocation payload conflicts, mission/request ID reservations,
lease issuance bindings and provider-recovery evidence. It does not prune live
leases or pending external operations. Genuine live capacity limits still fail
closed.

The operator supplies `JOVIE_WORKER_TOKEN` through the runtime's secret manager.
Never pass it as a CLI argument, put it in a report, or share it between workers.
The CLI sends it only to the selected fleet endpoint over HTTPS (HTTP is allowed
only on loopback), refuses redirects, and does not persist it. Ordinary public
commands do not send it. Fleet MCP tools are exposed only when the credential is
present; the server independently authenticates and authorizes every request.

Provisioning, rotation, revocation, direct mission admission and Summer delegation
use the existing founder control endpoint with an exact one-use approval. Worker
tokens cannot call that endpoint. Rotation preserves the worker ID, invalidates
the prior token and outstanding leases, and requires the new runtime to register
again. Only the configured founder can grant or revoke Summer delegation.

The initial mission contract allows `artist.get`, `artist.llms`, `api.openapi`
and `docs.llms`, with one concurrent lease and zero spend. Customer agents retain
customer visibility and authority. A display name is never identity proof.

Once the complete web and Summer runtime chain is deployed and explicitly enabled,
a founder delegation can admit requests for named operator workers, canonical
issues and read-only commands. It expires, caps admissions and permits zero spend.
Each eligible request persists an event atomically with its proposal. A fixed,
OIDC-authenticated Summer inlet receives only event IDs; the Jovie callback
rechecks current delegation, worker authority and canonical Linear work before
admission. Decisions retain the exact delegation receipt. The existing Summer
heartbeat repairs missed delivery in bounded batches; duplicate delivery replays
the durable decision, including after archival.

This source does not start the named worker processes or provide a verified wake
adapter for their external runtimes. Each worker still needs its own authenticated
runtime to register, claim and report work. No live enablement, fleet registration,
continuous operation or external artist outreach is established by installing the
CLI or merging this source. Live commissioning remains tracked in
[JOV-7331](https://linear.app/jovie/issue/JOV-7331) and
[JOV-7393](https://linear.app/jovie/issue/JOV-7393).

Docs: [Jovie CLI](https://jov.ie/cli), [developer resources](https://jov.ie/developers).

## Release boundary

The package directory is licensed under Apache-2.0 (see `LICENSE`); the
repository root and unrelated packages remain proprietary. Its manifest is
configured with `private: false` and public npm `publishConfig` for the
`https://registry.npmjs.org` registry, including provenance. It intentionally
has no source-manifest `version`; the manual main-only release workflow writes
the selected CLI release into a temporary publication directory. Its optional
`release_version` input accepts stable `YY.M.PATCH` (for example, `26.10.0`);
leaving it blank uses the root `VERSION`. A CLI release can therefore proceed
without changing the desktop stamp or the monorepo version fan-out. Invalid
versions and conflicting source-manifest versions fail before registry access.
A local build or
merged source change does not claim that npm publication succeeded.

The release-path smoke sequence for an approved manual publication is:

```sh
pnpm --filter @jovie/cli run typecheck
pnpm --filter @jovie/cli run test:coverage
pnpm --filter @jovie/cli run build
pnpm --filter @jovie/cli run pack:dry
```

To smoke-test an independent version without publishing, set `RELEASE_VERSION`
for the pack command (for example,
`RELEASE_VERSION=26.10.0 pnpm --filter @jovie/cli run pack:dry`). The workflow
passes its selected version to the same smoke path.

`pack:dry` builds a temporary versioned package, checks its metadata,
declarations, and contents, installs that tarball into a clean temporary
directory, imports the installed library, and runs the installed binary against
a local HTTP server. Publication is performed only by the repository's manual
`npm-publish.yml` workflow from exact current `main`; do not run a raw publish
from this source directory.

The workflow must prove the public registry version, provenance metadata,
maintainer ownership, a fresh exact-version install, and a critical installed
command before the release is considered available.
