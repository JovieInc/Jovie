# Latency-sensitive execution (thread-blocking gate)

JOV-6128 (parent [JOV-5887](https://linear.app/jovie/issue/JOV-5887)). GBrain provenance:
`jovie/coordination/latency-sensitive-execution-v1`. Executable identity: `JOV-INV-031`.

This file is the repo-side contract for the **thread-blocking** check class. It invents no
Lighthouse or route-latency numbers. Those stay in
[`performance-invariants-v1.md`](./performance-invariants-v1.md).

## Two check classes (do not merge)

| Class | What it proves | What it does not prove |
|---|---|---|
| `thread-blocking` | Known sync I/O / expensive sync crypto is absent from reachable request-path code, except a shrinking allowlist | That a route meets TTFB/FCP/LCP/INP budgets, or that crawlers wait less |
| `route-response-latency` | Named budgets in existing performance-invariants-v1 sources | That the event loop is free of `*Sync` I/O |

Converting `generateMetadata` (or any helper it calls) from sync to async does **not** change
crawler/bot wait latency. Do not claim that it does.

## Invariant

Latency-sensitive execution must remain responsive. All reachable application code must use
nonblocking I/O and keep uninterrupted CPU work within an approved budget at supported input
sizes. Expensive work must be bounded, partitioned with genuine yielding, precomputed, or
moved to an appropriate worker. Applies to request handlers, rendering, metadata, middleware,
server actions, browser interactions, and shared helpers. Moving a blocking call out of
`generateMetadata` into `getProfile()` is zero escape.

## Scope

Runtime request path and Electron main thread:

- `apps/web/app`, `lib`, `components`, `hooks`, `middleware.ts`, `proxy.ts`
- request-path packages: `ui`, `auth-routing`, `audio-contracts`, `extension-contracts`,
  `agent-transport-contracts`
- Electron `apps/desktop/src` main/preload plus helpers reachable by relative import

Import reachability is inspected from runtime files and desktop entry points. Renaming a
helper or placing it in a `workers/` folder is zero escape while a main-thread module
imports it. Isolated workers and build scripts remain out of scope unless imported.

Out of scope: `scripts/`, tests, stories, generated output, and isolated `workers/`
that no runtime entry imports. Existing request-path debt is ratcheted in
`scripts/invariants/latency-sensitive-execution-allowlist.json`. Counts may only decrease.
There is no blanket desktop or startup exemption.

## Rejected APIs

- fs: `readFileSync`, `writeFileSync`, `readdirSync`
- `existsSync` is gray: module top-level config-once is a documented exception; a call inside
  a request-path function is a violation (harness-only; not in the ESLint overlay)
- child_process: `execSync`, `spawnSync`, `execFileSync`
- zlib: `gzipSync`, `gunzipSync`, `deflateSync`, `inflateSync`, `unzipSync`,
  `brotliCompressSync`, `brotliDecompressSync`, `deflateRawSync`, `inflateRawSync`
- crypto: `pbkdf2Sync`, `scryptSync`, `randomFillSync`

Aliases, namespace members, `require()`, dynamic `import()`, and thin wrappers are followed.
Wrapping the same call in `async` is still a thread-blocking hit.

## Enforcement

1. Author-time: `no-restricted-syntax` overlay in `apps/web/eslint.config.js` (allowlisted
   files ignored there; atoms keep their own `no-restricted-syntax` override).
2. CI: `scripts/invariants/latency-sensitive-execution.mjs` composed into
   `scripts/invariants/validate.mjs` (`pnpm invariants:check`). No new workflow.

Regression fixtures live under `scripts/invariants/fixtures/latency-sensitive-execution/`.
