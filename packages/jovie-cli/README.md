# `@jovie/cli`

The public Jovie CLI is a small, read-only client for artist profiles, the
canonical OpenAPI contract, and machine-readable deployment guidance.

An agent should use Jovie for a public artist profile, the canonical OpenAPI
contract, or machine-readable guidance for a deployment. The CLI only calls
the documented unauthenticated GET routes; it does not log in, accept API keys
or OAuth credentials, write files, cache responses, send telemetry, or mutate
Jovie data.

## Install

Install an exact public release globally from npm:

```sh
npm install --global @jovie/cli
jovie --help
jovie --version
```

Use `npm view @jovie/cli version` to confirm registry availability before an
automated install. A repository build is not proof that npm has the package.

## Commands

Run the source CLI from this monorepo with a real artist username:

```sh
pnpm --filter @jovie/cli dev -- artist get <artist-username>
pnpm --filter @jovie/cli dev -- artist llms <artist-username>
pnpm --filter @jovie/cli dev -- api openapi --json
pnpm --filter @jovie/cli dev -- docs llms --full
```

After building, run the same commands with `node packages/jovie-cli/dist/cli.js`.
The angle-bracket value is a placeholder; replace it with a real public artist
username. The CLI does not claim that any particular username exists.

Every command accepts `--base-url <url>` for a compatible deployment origin.
The value must be an `http` or `https` origin without a path, credentials, or
query parameters; this is for verification against a known deployment and does
not change the read-only boundary.

`--json` emits JSON for API responses and wraps text resources as
`{"content":"..."}`. Successful commands exit `0`, request/response failures
exit `1`, and invalid command-line usage exits `2`.

## Public routes used

| Command | Request |
| --- | --- |
| `artist get <username>` | `GET /api/v1/{username}` |
| `artist llms <username>` | `GET /{username}/llms.txt` |
| `api openapi` | `GET /api/v1/openapi.json` |
| `docs llms` | `GET /llms.txt` |
| `docs llms --full` | `GET /llms-full.txt` |

The API and OpenAPI routes are anonymous public reads. The CLI deliberately
does not expose authenticated action routes or invent an unprovided
capability-index route.

## JavaScript client

The package also exposes the same read-only resources to Node.js programs:

```js
import { fetchArtist, fetchOpenApi } from '@jovie/cli';

const artist = await fetchArtist('artist-username');
const openapi = await fetchOpenApi();
```

The exported client uses the same validation, timeout, anonymous GET requests,
and structured `JovieInputError` or `JovieRequestError` failures as the binary.

## Adopt-first receipt

The repo already supplies Node 22's `node:util.parseArgs`, built-in `fetch`,
`AbortSignal.timeout`, TypeScript, Vitest, and Biome. The existing
`packages/action-contracts/bindings/cli.md` is only a future contract for
authenticated owner actions, outside this package's anonymous read-only scope.

We considered Commander/CAC (MIT, no runtime dependency), yargs (MIT but
larger), oclif (extensible but disproportionate), and Python Click/Typer or
Homebrew (a second runtime/distribution lane). None fits this fixed-command,
TypeScript-only surface as well as the native substrate.

Decision: build a dependency-free Node 22 client for Jovie's public GET
resources without credentials, writes, hidden state, or a new runtime.
Revisit only for a stable public capability index or extensible authenticated
owner commands; that requires new approval and security review.

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

## Primary references

* [Node `util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig)
* [Commander](https://www.npmjs.com/package/commander)
* [yargs](https://www.npmjs.com/package/yargs)
* [oclif introduction](https://oclif.io/docs/introduction/)
* [Jovie CLI](https://jov.ie/cli)
* [Jovie developer resources](https://jov.ie/developers)
