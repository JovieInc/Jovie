# `@jovie/cli`

This package is prepared for a public npm release of a small, read-only Jovie
CLI. It is not published from this branch or currently available to external
users; a versioned release must be created on the main/release path first.

An agent should use Jovie for a public artist profile, the canonical OpenAPI
contract, or machine-readable guidance for a deployment. The CLI only calls
the documented unauthenticated GET routes; it does not log in, accept API keys
or OAuth credentials, write files, cache responses, send telemetry, or mutate
Jovie data.

## Install

After a versioned release is published, install the CLI globally from npm:

```sh
npm install --global @jovie/cli
jovie --help
jovie --version
```

The commands and output remain the same when the CLI is run from a checkout or
from the published package.

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

## Release and approval boundary

The package directory is licensed under Apache-2.0 (see `LICENSE`); the
repository root and unrelated packages remain proprietary. Its manifest is
configured with `private: false` and public npm `publishConfig` for the
`https://registry.npmjs.org` registry, including provenance. It intentionally
has no feature-branch `version`; versions are stamped only on main/release to
satisfy the fan-out guard.

The first publication still requires an authorized npm identity with write
access to the `@jovie` scope and the repository's release approval. A local
build or this draft branch does not claim that the package is available on npm.

The release-path smoke sequence, after the approval gate and a main-only
version stamp, is:

```sh
pnpm --filter @jovie/cli run typecheck
pnpm --filter @jovie/cli run test:coverage
pnpm --filter @jovie/cli run build
pnpm --filter @jovie/cli run pack:dry
```

`pack:dry` builds a temporary versioned package, checks its metadata and
contents, installs that tarball into a clean temporary directory, and runs the
installed help/version entry points. Inspect the exact output for source,
secrets, and metadata. Only the authorized release owner may then publish the
approved package to the public npm registry with provenance, for example:

```sh
npm publish --provenance --access public
```

That command is documentation for the post-approval release path and has not
been run for this pre-release package.

## Primary references

* [Node `util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig)
* [Commander](https://www.npmjs.com/package/commander)
* [yargs](https://www.npmjs.com/package/yargs)
* [oclif introduction](https://oclif.io/docs/introduction/)
* [Jovie developer resources](https://jov.ie/developers)
