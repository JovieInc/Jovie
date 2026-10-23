# Lint and typecheck audit (2026-10-23)

Internal audit of what Jovie runs, what it costs, and what is safe to change.
No rule or required check was weakened. The only code change from this audit
is the read-only `tsbuildinfo` restore in Source Validation
([#22713](https://github.com/JovieInc/Jovie/pull/22713)).

Measured on a 4 vCPU Linux agent (Node v22.23.4, pnpm 9.15.9) unless a GitHub
Actions run is cited. `gbrain` was not installed (`gbrain-unavailable`). Linear
MCP was unauthenticated, so follow-ups are listed at the end instead of filed.

## 1. Current state

### Who owns which rules

Biome 2.5.14 (`biome.json`, preset `none`) is the formatter and the fast
linter. Enabled groups:

- a11y: most rules `error`; `useHeadingContent` off. Test, story, and script
  overrides turn off `noNoninteractiveElementInteractions` and `useAltText`.
- correctness: unused imports/variables, const assign, undeclared variables,
  unreachable, invalid constructor super, use-before-declaration. `useExhaustiveDependencies` is off.
- suspicious: duplicate keys, debugger, fallthrough, double equals, `noExplicitAny` error, `noArrayIndexKey` warn.
- complexity: `noUselessFragments` warn.
- security: `noDangerouslySetInnerHtml` warn.
- style: `useConst` (ESLint `prefer-const` was moved here), `noRestrictedGlobals` (`global`, `alert`, `confirm`, `prompt`), `noRestrictedImports` (`simple-icons`).

`@typescript-eslint/no-unused-vars` and `no-explicit-any` are intentionally
absent from ESLint. Biome owns them (`apps/web/eslint.config.js`).

ESLint 10.12.0 (`apps/web`) is the repo-specific linter. It loads
`eslint-config-next` and `eslint-config-next/core-web-vitals`,
`eslint-plugin-boundaries` (path rules on `components/**`, `element-types` warn),
`@shadcn/lint` (`shadcn/no-restyle`), and 22 `@jovie/*` rules in
`apps/web/eslint-rules/`. The parser is `@typescript-eslint/parser` only.
There is no `parserOptions.project` and no typescript-eslint type-checked
preset. `import/resolver: typescript` resolves paths; it does not type-check.

The 22 custom rules cannot move to Biome. They encode Jovie contracts
(server/client boundary, routes, Stripe, db pooling, query cache, ui-feel,
focus ring, motion tokens, marketing copy, Clerk id lookup, shadcn restyle
stays in `@shadcn/lint`).

Biome 2.5.14 does ship type-aware nursery rules such as `noFloatingPromises`.
Turning the type domain on starts Biome's scanner. That adds work. It does
not replace the custom ESLint rules. Not a speedup.

oxlint is not installed. A pre-pass only pays for itself if it deletes an
ESLint rule set. The boundaries profile below says the rules themselves are
cheap, so an oxlint pre-pass would duplicate parsing.

### Where each check runs

| Surface | Biome | ESLint | Typecheck |
| --- | --- | --- | --- |
| Pre-commit (`.husky/pre-commit` + lint-staged) | `biome check --write` on staged JS/TS; `biome format` on JSON/CSS; component a11y via Biome | Full `eslint.config.js` on staged `apps/web/**/*.{ts,tsx}`, content cache at `apps/web/.cache/eslint` | Not run (CI, per the hook comment) |
| Pre-push, default publication phase | Not run | Not run | Not run |
| Pre-push, qualification phase | `biome check --changed --since` base | Not the full config | Web pre-push typecheck |
| Source Validation (pull request) | `pnpm biome:check` on the whole tree | `lint:eslint:changed` (full config, changed web TS/TSX, no `--cache`) plus ui-feel on added lines; separate shadcn baseline step | `pnpm typecheck` (`turbo --affected`, not `--force`), web tests and stories in parallel with it, then `typecheck:scripts` |
| ci-fast, merge group (`ci.yml`) | Changed files, unless `biome.json`, `package.json`, or the lockfile changed | Server-boundaries config only (two custom rules, content cache) | `pnpm turbo typecheck --affected --force`, plus web tests and stories. Restores `tsbuildinfo` |

PR Ready is the aggregate job. It does not lint or typecheck itself.
`ci.yml` does not run on `pull_request`. The pull-request gate is Source
Validation. The merge queue is `ci.yml`.

Duplicated on purpose:

- Staged files get Biome and full ESLint before commit. CI repeats Biome
  (full tree on the PR, changed files in the queue) and ESLint (changed files
  on the PR, boundaries-only in the queue).
- Web typecheck runs in Source Validation and again, with `--force`, in the
  merge group. The second run is the JOV-3499 gate: turbo must not replay a
  cached success. Do not delete it.
- Source Validation's full-tree Biome is stricter than ci-fast's changed-file
  Biome. Do not narrow it.

### Wall time

Local web typecheck (`tsc -p tsconfig.typecheck.json --noEmit --incremental --tsBuildInfoFile .cache/tsbuildinfo --pretty false --diagnostics`, heap cap 6 GB, 12,218 files):

| Run | Exit | Wall | tsc total | Check | Memory |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold, buildinfo deleted | 0 | 103.8s | 102.0s | 88.9s | 5,112,092K |
| Warm no-op | 0 | 12.2s | 10.6s | 0.0s | 2,242,339K |
| One exported const appended to `apps/web/lib/hud/number-series.ts`, then restored | 0 | 12.7s | 11.2s | 1.4s | 2,323,970K |

`packages/ui` (`tsc --noEmit --incremental`, 248 files): cold 3.1s (check 1.6s), warm 1.2s (check 0.0s).

`pnpm` script `typecheck:scripts` on this machine exited in 0.2s with a Node
version refusal: it will not typecheck or write the baseline on Node v22.23.4.
CI runs it on the workflow's Node and recorded 19.0s inside merge group
[39893817130](https://github.com/JovieInc/Jovie/actions/runs/39893817130).

Biome `check --reporter=summary .`: 11.6s wall, "Checked 14012 files in 10s",
10 warnings (`noUselessFragments` 5, `noArrayIndexKey` 5), exit 0. The
filesystem cache was already warm.

ESLint server-boundaries config (the merge-queue lane), `TIMING=1`, whole
`apps/web` tree. Exit 1 is from linting `scripts/` with a config that does not
define `@jovie/no-manual-db-pooling` (117 errors, 21 warnings). CI filters
those files out before invoking ESLint, so this exit is the bench command,
not a CI failure.

| Run | Wall | Rule time |
| --- | ---: | --- |
| Cold cache | 21.8s | `@jovie/use-client-directive` 30.0ms (54.6%), `@jovie/server-only-imports` 24.9ms (45.4%) |
| Warm content cache | 1.5s | Same two rules; rule time is noise next to the wall clock |

The rules are not the cost. Parsing and ESLint startup are. A warm content
cache drops the tree from 21.8s to 1.5s.

Full `eslint.config.js` `TIMING=1` on the whole web tree was still on one
core past 16 minutes when this section was written (RSS about 1.7 GB, output
still buffered). CI does not run that command on the whole tree. It runs
`lint:eslint:changed`. The boundaries profile is the one that matches the
merge-queue lane. If the full-tree table finishes, it belongs in the same
section; it does not change the recommendation, because the two rules that
CI always runs are already under 55ms combined.

### CI jobs (successful runs on 2026-10-23)

Merge group [39893817130](https://github.com/JovieInc/Jovie/actions/runs/39893817130)
(marketing PR). Job wall clock:

| Job | Wall |
| --- | ---: |
| ci-fast (typecheck) | 127s |
| of which the three typecheck lanes, overlapped, after a cache hit | 67.4s |
| ci-fast (remaining) | 148s |
| ci-fast (structural web) | 216s |
| ci-fast (structural python) | 80s |
| Ovie Typecheck | 92s |
| Build + Layout | 165s |
| PR Ready | 4s |

Cache restore in that typecheck job hit
`jovie-web-tsbuildinfo-v2-Linux-…-h2026102303` in about 1s. Lane durations
inside remaining (parallel, so the job wall is not the sum): biome 0.6s,
eslint-server-boundaries 1.7s, shadcn-lint-contracts 21.6s, scripts-typecheck
19.0s, design-governance-enforcement 19.6s, structural (own step) 15.3s.

Source Validation [39894869463](https://github.com/JovieInc/Jovie/actions/runs/39894869463):

| Step or job | Wall |
| --- | ---: |
| Source Validation job | 612s |
| setup-node-pnpm | 40s |
| disk-read source contracts | 202s |
| deterministic source contract | 336s |
| shadcn changed lint | 3s |
| Affected unit tests, slowest shard | 510s |
| Exact-head Coverage | 163s |
| Security Evidence | 139s |
| Migration Guard | 51s |
| PR Ready | 3s |

A second Source Validation job
([39895005469](https://github.com/JovieInc/Jovie/actions/runs/39895005469))
spent 92s on disk-read contracts and 320s on the deterministic contract.

`tsc-cache-warm` run
[39895447664](https://github.com/JovieInc/Jovie/actions/runs/39895447664)
hit the cache and skipped typecheck. Job wall 40s, mostly setup-node.

Lint is not the merge-queue bottleneck. The pull-request bottleneck is the
deterministic contract (typecheck with a cold buildinfo, full-tree Biome,
changed-file ESLint, and the harness scripts) plus disk-read contracts and
affected unit shards.

## 2. Typecheck

Root `tsconfig.json` is a solution-style file (`include: []`) with references
to the extension, web, ui, and a few contract packages. `composite` is set
only on `packages/ui`. Web is not composite, so `tsc -b` is not a working
graph. Turbo runs each package's `tsc --noEmit`.

Web uses three programs, each with its own buildinfo:

- `tsconfig.typecheck.json` → `.cache/tsbuildinfo` (the `typecheck` script, 8 GB heap in CI via `typecheck-singleflight.mjs`)
- `tsconfig.test.json` → `.cache/tsbuildinfo-tests`
- `tsconfig.stories.json` → `.cache/tsbuildinfo-stories`

`scripts/tsconfig.json` is `checkJs`, `strict: false`, and not incremental.
The script refuses to run on Node 22.

`skipLibCheck` is true on the root config and on every package tsconfig that
sets it (15 configs). `isolatedDeclarations` is unset everywhere.
`ignoreDeprecations: "6.0"` is set on web. Installed compiler is TypeScript
6.0.3 (`typescript` `^6.0.3`).

Scope: `pnpm typecheck` is `scripts/run-scoped-turbo-task.mjs`, which adds
turbo `--affected` when HEAD is not the merge base of `origin/main` (it also
tries `origin/develop` first). ci-fast calls
`pnpm turbo typecheck --affected --force` directly. `--force` is required by
`scripts/ci-typecheck-gate-guard.mjs` (JOV-3499) so turbo cannot replay a
cached success. Incremental `tsbuildinfo` is still safe: `tsc` re-hashes
inputs and rechecks changed files and their dependents.

CI cache:

- Turbo remote cache (`TURBO_TOKEN`) is enabled in `ci.yml` for `push` and
  `workflow_dispatch` only. Pull requests and merge groups use a local turbo
  cache. `scripts/turbo-local.mjs` (what `pnpm typecheck` calls) defaults to
  `local:rw,remote:r` and reads Doppler for the token. Doppler is not on the
  GitHub runner, and Source Validation does not set `TURBO_TOKEN`, so that
  remote read stays off there.
- Actions cache key family `jovie-web-tsbuildinfo-v2-…` covers
  `apps/web/.cache/tsbuildinfo*`. `tsc-cache-warm.yml` writes it on main.
  ci-fast restores it in the merge group. Source Validation previously did
  not. Pull requests can read default-branch caches. They must not save a
  pull-request-scoped copy: merge groups cannot read it, and the 10 GB cap
  is already the reason main is the only writer (JOV-6835).

### tsgo / TypeScript 7

npm on this date: `typescript` 7.0.2 and `@typescript/native-preview`
7.0.0-dev.20260707.2. Both install and print a version from `/tmp/tsgo-audit`
(not the repo, lockfile untouched). A side-by-side check of
`apps/web/tsconfig.typecheck.json` was not used as a gate. Web sets
`ignoreDeprecations: "6.0"`, which TypeScript 7 can reject, and
`apps/web/tsconfig.json` loads the Next type plugin. Tools that import the
`typescript` package (ESLint, Next) still need the 6.x API. Shipping a
compiler major in this audit would not be a low-risk speedup. The local
6.0.3 cold check is 89s of the 104s wall; a native compiler is the large
remaining typecheck win after the buildinfo restore, and it needs a
diagnostic diff against 6.0.3 first.

## 3. Lint migration

What can move to Biome: nothing else that is currently slow. `prefer-const`,
unused vars, and `noExplicitAny` already moved. Biome a11y overlaps part of
`eslint-config-next` jsx-a11y. Disabling jsx-a11y without a violation diff
would weaken the pull-request ESLint gate. Do not do that in a speedup.

What must stay in ESLint: all 22 `@jovie/*` rules, `shadcn/no-restyle`,
`boundaries/element-types`, and the Next core-web-vitals rules that Biome
does not duplicate exactly.

Changed files: pre-commit already lints staged files. Source Validation
already lints changed web files with the full config. ci-fast already lints
changed files for Biome and server boundaries. The full-tree Biome on the
pull request stays.

ESLint cache: lint-staged and `lint:eslint` use `--cache --cache-strategy content`.
`lint:eslint:changed` does not. Content cache is safe with a warm directory.
GitHub runners start cold, so the cache helps only if Actions restores
`.cache/eslint`. The boundaries lane already does that locally in the job
(1.5s warm vs 21.8s cold) but the job does not restore an Actions cache of
it. Restoring it is a few seconds on that lane, which is already 1.7s in the
merge group. Not worth a pull request next to the typecheck restore.

oxlint: do not add it until a full-tree `TIMING=1` shows a rule family that
oxlint can replace outright. The boundaries profile does not.

## 4. Recurring corrections

JOV-INV-024 principle H-06 is "Repeated feedback becomes a guard, not a
reminder." Status `partial`. The gate is `LESSONS.md`, not a lint generator.
Exception H-EX-06, owner Summer, expires 2026-10-31. Missing closure:
"Repeated feedback fingerprint linked to a guard or cannot-recur disposition."
Next action is a Symphony slice, not a new ESLint plugin. This is the
existing contract for turning repeated review corrections into guards.

Enforced by code today: the harness validator checks that an H-06 receipt
names a deterministic command. It does not mine review comments or emit lint
rules.

One invariant is also an ESLint rule. JOV-INV-031 (latency-sensitive
execution) is `scripts/invariants/latency-sensitive-execution.mjs` and a
`no-restricted-syntax` overlay in `apps/web/eslint.config.js` for sync
`fs` and `crypto`. JOV-INV-032 says `eslintLane: false` and `biomePrimary: true`;
the consumer is `scripts/invariants/ios-web-no-scroll-jank.mjs`, not a Biome
rule. The other adopted invariants are scripts, workflows, or docs.

Review comments since 2026-10-09 (1,060 pull-request review comments):

| Author | Count | What they are |
| --- | ---: | --- |
| sentry[bot] | 1,011 | Mostly "Resolved in \<sha\>" notes, not a repeated style rule |
| itstimwhite | 28 | Fix confirmations and design replies (ui-feel word boundaries, connector unavailable badge, 44px target vs `shadcn/no-restyle`, dead Tailwind `content-empty`, changelog anchors, credential-assurance stripping, mutation-diff type-only files) |
| chatgpt-codex-connector[bot] | 15 | One-off P1/P2 bugs in CI, coverage inventory, remediation |
| jovie-bot | 6 | Fix confirmations |

Candidates, not implemented here:

- H-06 fingerprint → guard. Already specified, partial, expires 2026-10-31.
- Dead Tailwind class (`content-empty`). Tim confirmed the reported layout
  bug does not happen because `--tw-content` defaults to empty, and left the
  class. A lint rule would be new strictness, not a reviewed correction that
  is still recurring.
- ui-feel is ratchet-only on added lines (`lint-ui-feel.mjs --changed`)
  because of existing debt. Turning it on for the whole tree would fail CI
  until the debt is cleared. That is a strictness raise, not a safe speedup.
- jsx-a11y versus Biome a11y overlap. Needs a violation diff before any rule
  is turned off.

No cluster in this window is strong enough to add a lint rule inside this
audit.

## 5. Plan

| Priority | Change | Expected save | Risk | Effort | State |
| --- | --- | --- | --- | --- | --- |
| 1 | Restore main's web `tsbuildinfo` in Source Validation, read-only | Local app program 92s cold to warm (104s → 12s). The deterministic step is 320–336s and also runs tests then stories, full-tree Biome, and changed ESLint. Expect on the order of 30–90s off that step when the PR is near main; less when a signature fans out. Merge-group lanes with a warm cache already finish in 67s wall. | Low. `tsc` re-hashes. No save. `--force` unchanged. | Contract test added | Shipped in [#22713](https://github.com/JovieInc/Jovie/pull/22713) |
| 2 | TypeScript 7 / `tsgo` beside 6.0.3, then adopt only after diagnostics match | The 89s check phase is the piece a native compiler targets. Not measured on this repo's config. | High until `ignoreDeprecations`, the Next plugin, and diagnostic parity are clean. ESLint and Next keep importing TypeScript 6. | Separate project | Not shipped. Needs Tim's call after a parity diff |
| 3 | Close H-06 (fingerprint → guard or cannot-recur) | None. Stops repeated review comments from staying prose | Product. Exception expires 2026-10-31 | Summer | Not shipped. Needs Linear |
| 4 | Full-tree ESLint `TIMING=1`, then delete only rules whose time is real and whose Biome equivalent matches on a violation diff | Unknown. Boundaries rules are 55ms of a 22s cold run, so do not expect a large win | Medium if a Next rule is dropped early | After the profile | Not shipped |
| 5 | oxlint pre-pass | Likely none while custom rules stay in ESLint | Extra tool, duplicate findings | Only if priority 4 shows a replaceable family | Not shipped |
| 6 | Actions cache for `.cache/eslint` on the boundaries lane | About 20s the first time that lane scans the whole tree; the merge-group lane was already 1.7s | Low | Small | Not shipped. Too small beside priority 1 |
| 7 | Incremental `scripts/tsconfig.json` plus CI cache | CI scripts typecheck was 19s. Local run refused Node 22 | Low, after the Node 24 pin is understood | Small | Not shipped |
| 8 | Enable Biome type-domain rules, move custom rules to Biome, narrow pull-request Biome to changed files, or drop `--force` | Negative or a weaker gate | High | — | Rejected |

### What needs Tim

- Linear in this environment is unauthenticated (Cursor MCP `needsAuth`;
  no `LINEAR_API_KEY`; Doppler is not installed). These follow-ups were not
  filed, and they were not opened as GitHub issues. After Linear is connected,
  dedupe against open JOV issues and file:
  - `Candidate follow-up: close H-06 by linking a repeated-feedback fingerprint to a guard`
  - `Candidate follow-up: TypeScript 7 / tsgo diagnostic parity against the web typecheck program`
  - `Candidate follow-up: ESLint TIMING profile before any jsx-a11y or oxlint move`
- JOV-INV-022: the writer does not arm auto-merge. Merge Queue Green Enroll
  is the sole admitter once required checks are green.
- Adopting TypeScript 7 is a compiler-major decision. The versions install.
  The repo config was not switched.
