# Build vs Buy, and Prior Art First

Tim, 2026-10-29: "If a library does in 50k lines what we can do in 2, write the 2.
If it is 10k lines either way and the npm package is a one-click install, install
it and move on; do not write 10k lines we have to debug." And for algorithms and
complex systems: research who is smarter than us first, then design our own, then
compare and harden.

This is the operational rubric under the sourcing policy in
[ENGINEERING.md](./ENGINEERING.md#capability-sourcing-and-ia-integration)
(JOV-INV-044). That section decides *how to search*; this file decides *what to
pick* and is enforced in CI. Config and thresholds: [`build-vs-buy.json`](./build-vs-buy.json).

## The ponytail test

Lines we would own and maintain forever, versus the weight we take on by renting.
Count both sides honestly:

| Own it costs | Rent it costs |
|---|---|
| Every line we write, test, secure and debug, plus agent tokens to re-read it | Package unpacked size and **transitive** packages |
| Edge cases the package already survived (quoting, time zones, retries, unicode) | Release cadence, open CVEs, bus factor, license |
| Bugs only we will ever find | Lock-in and exit cost (how many call sites change if it dies) |
| | Security surface and bundle impact |

## Decision order (first match wins)

1. **Moat: own it.** If it is why a customer picks Jovie (ranking, resolution,
   the one-right-thing signal, pricing logic, the audience permission model), we
   write and keep it. We still do prior-art research first (below).
2. **Platform feature: use it.** `crypto.randomUUID`, `structuredClone`,
   `Intl`, `URL`, `fetch`, Postgres, the Next.js and Vercel primitives.
3. **Tiny need: write the few lines.** A pure helper under ~50 lines with no
   edge-case tail does not justify a dependency (a 50k-line library for 2 lines
   of need loses).
4. **Commodity: use a well-maintained package.** Dates, markdown, CSV, retries,
   debounce, schema validation, auth, payments. If it is roughly the same size
   either way, install the package; do not write a module we have to debug.
5. **Already have one: use ours.** One library per role
   ([`data-architecture.json`](./data-architecture.json) for data, fetching,
   cache and realtime; `packages/api-client` for third-party calls). A second
   library for an existing role is a one-off; extend the approved one or amend
   the ADR first.
6. **Never vendor-fork without a reason.** A fork names upstream, license, patch
   scope, update owner and exit trigger (ENGINEERING.md item 4). Prefer upstream
   contribution or a thin adapter.

Borrow and steal are legitimate: read how the best open source does it, copy the
*idea* (and respect the license), keep the dependency out.

## Health bar for any new package

Reject or justify in writing when any of these fail:

- Released in the last 12 months, or stable and tiny with no open advisories.
- No open high/critical CVEs (Dependency Review already blocks added high/critical
  and GPL/AGPL; it does not judge maintenance or size).
- More than one maintainer, or a company or foundation behind it, when it sits on a
  security or revenue path.
- Permissive license (MIT, Apache-2.0, BSD, ISC).
- Exit cost: fewer than ~10 call sites, or a thin wrapper that localizes it.
- Transitive count and size proportionate to the job. A package that pulls 40
  dependencies for a 30-line job is a write-it case.

`node scripts/build-vs-buy-facts.mjs <package>` prints size, transitive count,
last release, maintainers and license ready to paste.

## What we manage, own, rent, give away

| Posture | Examples | Rule |
|---|---|---|
| **Own** (moat) | Signal-picked profile, audience permission model, ranking and matching, pricing and entitlements logic, Ovie agent loop | Hand-written, tested, benchmarked against prior art |
| **Rent** (commodity) | Postgres/Neon, Stripe, Better Auth, Vercel, date-fns, remark, csv-parse | Thin adapter at the boundary; one library per role |
| **Borrow** | Algorithms and patterns from papers and OSS | Cite in `research/`; reimplement the idea, keep the license clean |
| **Give away** | Non-moat tooling worth open-sourcing (see the repo-boundary decision) | Public code, private data and brain |

## Algorithms and complex systems: prior art first

For ranking, matching, resolvers, schedulers, pricing models, merge or queue
logic, scoring and similar cores, in this order:

1. **Research prior art.** Who smarter than us has tried this? Papers, posts,
   open-source implementations. Cite them in gbrain under `research/<slug>`
   (via `jovie research`, which caches and caps spend).
2. **Write our own design from first principles**, without leaning on the
   prior-art code.
3. **Compare the two.** Keep the best of each. Say what we kept, what we changed
   and why.
4. **Harden** with tests and a benchmark that runs ours against the prior art
   (same inputs, same metric).

Planning agents do step 1 before they write a plan. A plan with no cited prior
art for an algorithmic core is not ready.

## Enforcement (diff-scoped, LLM-free)

All checks run in PR Fleet Rules (`scripts/pr-fleet-rules.mjs`, logic in
`scripts/lib/build-vs-buy.mjs`) and locally in `pnpm preflight:changed`, which
prints a paste-ready template for whatever section is missing.

| Trigger | Required in the PR body |
|---|---|
| A manifest adds a dependency | `## Build-vs-buy` with `Package` (names every added package), `Size`, `Transitive`, `Maintenance`, `Why` (why not a few lines, an existing dependency or a platform feature) |
| 400+ hand-written lines added as new files in one domain (`newModuleLineThreshold`; tests, generated, fixtures and vendored code excluded) | `## Build-vs-buy` with `Considered` and `Why` (why no maintained package or platform feature covers it, or that it is our moat) |
| Added code redefines a known commodity (date helpers, markdown parser, retry/backoff, debounce/throttle, CSV parser, uuid, deep clone/equal, class names) | Fails with the approved package named. Waive on or above the line with `// build-vs-buy-ok: <reason>` |
| New or rewritten file under `resolver/`, `ranking/`, `matching/`, `scheduler/`, `pricing/`, `scoring/` and similar (or label `type: algorithm`) | `## Prior art` with at least one https link, `Research: research/<slug>`, `Comparison`, `Benchmark` |

No ratchet file is needed for the diff checks: the rule only looks at what a PR
adds, so existing code is never grandfathered or blocked. The tree-wide count of
standing reinventions is measured instead and should only fall.

## Measurement

`scripts/build-vs-buy-metrics.mjs` runs in the daily Shipping SLO job and commits
[`docs/metrics/build-vs-buy-latest.json`](../docs/metrics/build-vs-buy-latest.json):
dependency count, maintained lines per domain, standing reinventions by rule and
waiver count. A summary rides in the `slo.buildVsBuy` block of the lanes status
feed, which is where Summer reads it. The daily commit history is the trend.
PR-time catches are annotations on the PR Fleet Rules check.

**Ship now:** diff-scoped enforcement and daily snapshot.
**Re-evaluate when:** a month of snapshots shows the standing reinvention count
flat, a waiver is used for a pattern three times (promote it to an approved
wrapper), or a false-positive reinvention hit appears twice (tighten its pattern).
**Then:** add a ratchet over the standing count and a durable catch ledger.
