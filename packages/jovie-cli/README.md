# `@jovie/cli`

Jovie for AI agents. One package is a CLI, an MCP server, and an agent skill.
An agent can give a music artist a Jovie profile from their Spotify artist
URL, then hand the artist a claim link. No login or API key is required.

## Install

Install an exact public release globally from npm:

```sh
npm install --global @jovie/cli
jovie --help
jovie --version
```

Or run without installing: `npx -y @jovie/cli --help`.

Use `npm view @jovie/cli version` to confirm registry availability before an
automated install. A repository build is not proof that npm has the package.

## Commands

| Command | Request |
| --- | --- |
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

`--json` emits JSON for API responses and wraps text resources as
`{"content":"..."}`. Failures print `{"error":{...}}`, and API failures carry
the server's stable `apiCode` (for example `RATE_LIMITED`). Successful commands
exit `0`, request/response failures exit `1`, and invalid usage exits `2`.

Every command accepts `--base-url <url>` for a compatible deployment origin.
The value must be an `http` or `https` origin without a path, credentials, or
query parameters.

## MCP

```json
{ "mcpServers": { "jovie": { "command": "npx", "args": ["-y", "@jovie/cli", "mcp"] } } }
```

Tools: `create_profile`, `get_artist`, `get_artist_guide`, `get_openapi`,
`get_docs`, `report_issue`, `report_feedback`. `server.json` describes the package for the MCP registry.

## JavaScript client

```js
import { createProfile, fetchArtist } from '@jovie/cli';

const profile = await createProfile('https://open.spotify.com/artist/<id>');
const artist = await fetchArtist('artist-username');
```

## Boundary

The CLI sends no credentials, caches nothing, and sends no telemetry beyond a
`jovie-cli/<version>` User-Agent. `profile create` and `report` are its only writes. Reports carry only the CLI
version, platform, runtime, and the fields you pass. `init`
writes only `jovie/SKILL.md` into existing agent skill directories, or into
`--dir`. Commands use Node 22 built-ins (`parseArgs`, `fetch`, `readline`) and
have no runtime dependencies. The MCP server covers tools only; adopt the
official SDK when resources, prompts, or HTTP transport are needed.

Docs: [Jovie CLI](https://jov.ie/cli), [developer resources](https://jov.ie/developers).

## Release boundary

The package directory is licensed under Apache-2.0 (see `LICENSE`); the
repository root and unrelated packages remain proprietary. Its manifest is
configured with `private: false` and public npm `publishConfig` for the
`https://registry.npmjs.org` registry, including provenance. It intentionally
has no source-manifest `version`; the manual main-only release workflow stamps
the root `VERSION` into a temporary publication directory. A local build or
merged source change does not claim that npm publication succeeded.

The release-path smoke sequence, after the approval gate and a main-only
version stamp, is:

```sh
pnpm --filter @jovie/cli run typecheck
pnpm --filter @jovie/cli run test:coverage
pnpm --filter @jovie/cli run build
pnpm --filter @jovie/cli run pack:dry
```

`pack:dry` builds a temporary versioned package, checks its metadata,
declarations, and contents, installs that tarball into a clean temporary
directory, imports the installed library, and runs the installed binary against
a local HTTP server. Publication is performed only by the repository's manual
`npm-publish.yml` workflow from exact current `main`; do not run a raw publish
from this source directory.

The workflow must prove the public registry version, provenance metadata,
maintainer ownership, a fresh exact-version install, and a critical installed
command before the release is considered available.
