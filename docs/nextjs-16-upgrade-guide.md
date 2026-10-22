# Next.js upgrade and Cache Components maintenance

Owner: Tim White / JOV-7987. Source audit: 2026-10-15; Jovie
`db2aecddf035db6e1be98b8759ed1db3081ecb6f`; LYB
`b95b34da12c3f933e413b6f37b7ad503d2974151`. GBrain: `gbrain-unavailable`.
This is a source/compatibility receipt, **not completed adoption or deployed certification**.
The implementation lane publishes one draft; the independent gate owns landing.
Remaining architecture maintenance and customer-path certification stay in JOV-7987.

## Supported upgrade decision

Registry `latest` was 16.4.1, published 2026-10-14T17:43:55Z; `canary` was
16.5.0-canary.13. Pin the stable patch, not the announcement's older 16.4.0.
[The patch release](https://github.com/vercel/next.js/releases/tag/v16.4.1)
fixes critical cache/Image Optimization RCE and high Server Actions DoS:
[cache advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr),
[image advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[actions advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r).
September's patched versions alone are no longer a current security baseline.

All five Jovie apps declared/resolved Next 16.3.8 and React/DOM 19.3.0.
Root React overrides also select 19.3.0. Next 16.4.1's published peers accept
React 19; no React or package-manager migration is needed for this patch.

| App | Decision | Source deployment boundary / compatibility |
| --- | --- | --- |
| `apps/console` | Upgrade to 16.4.1 | Separate Next project; Node >=24.22.1 <25 |
| `apps/docs` | Upgrade to 16.4.1 | Vercel / Nextra 4.6.1; Node >=24.22.1 |
| `apps/ovie` | Upgrade to 16.4.1 | Vercel standalone / Workflow 4.8.13; Node 24 |
| `apps/should-i-make` | Upgrade to 16.4.1 | Vercel standalone; Node >=24.22.1 |
| `apps/web` | Upgrade to 16.4.1 | Vercel standalone / Better Auth 1.7.7 / Workflow 4.8.13; Node 24 |
| LYB `apps/web` | Patch 15.5.27 to 15.5.28; hold major migration | Vercel web plus conditional Capacitor static export; Node 22 / pnpm 10.34.1 |

LYB's declared **and locked** Next is 15.5.27; React/DOM resolve to 19.3.0.
The urgent patch and exact-runtime certification are owned by
[LYB-184](https://linear.app/jovie/issue/LYB-184/patch-next-to-15528-for-october-2026-security-advisories),
not implemented in this Jovie PR. Preserve LYB-103 / merged PR #1206's
`minimumReleaseAgeExclude` entries. Next 15 remains Maintenance LTS; do not
force a major upgrade before proving web and Capacitor compatibility.

Jovie uses pnpm 9.15.9, `.nvmrc` 24.22.1, and no pnpm minimum-release-age setting.
Dependabot cooldowns are 7/3/1 days for major/minor/patch; security updates are
unaffected. No age/security setting was relaxed. There is no existing Next patch.
Web's analyzer and ESLint config resolve to 16.4.0 before, 16.4.1 after.
A version-bound Storybook 10.6.2 patch supplies the layout cache-node context
required by Next 16.4's real `useRouter`, retaining the real RedirectBoundary.
JOV-8234's failure reproduces even on unpatched Storybook 10.6.2.
Remove the patch when an upstream integration passes the same browser matrix.
A separate Nextra 4.6.1 patch uses `repository.workdir()` for document-history
paths: a 15+ minute build exposed incorrect paths outside linked worktrees.
The installed-loader regression fails before this fix.

The open-PR check found no Next 16.4 title match in either repo. Jovie #21682
(parent commissioning) and #21705 also touch the lockfile; recheck/rebase through
the independent gate. Deployed versions/Node patch versions for all six apps are
**unknown**: manifests, local builds and Vercel config do not attest live runtime.
The public Web version endpoint returned build `3eebc9c`; it exposes no Next or
Node version and cannot certify this upgrade.

## Rendering-model evidence and coverage

Effective production config was loaded from each app's own working directory,
including Web's Workflow → analyzer → toolbar → conditional Sentry wrappers,
Ovie's Workflow wrapper, and Docs' Nextra wrapper. All five resolve
`cacheComponents: false`; Partial Prefetching is unset. Web has React Compiler
and experimental router stale times (30s dynamic / 300s static).
No remote Cache Components handler is configured. Enabling a flag would affect
untouched routes and would not establish adoption.

On Next **16.4.1 / Node 24.21.0**, an isolated production build with
`cacheComponents: true`, `partialPrefetching: true` and an API route exporting
`runtime='nodejs'` fails: `Route segment config "runtime" is not compatible with
nextConfig.cacheComponents`. Removing only the export makes that build pass on
Node. This reproduces a **segment-export migration**, not a Node incompatibility.
It does not prove the complete Jovie app can enable the model yet.

[Official configuration guidance](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
says both features become enabled everywhere in the next major and their options
are removed. Existing 16.x apps are not automatically migrated. Dynamic data
behind Suspense remains valid; uncached components are not universally unsupported.
[Migration guidance](https://nextjs.org/docs/app/guides/migrating-to-cache-components)
replaces segment caching controls with cache boundaries/lifetimes; existing fetch
and `unstable_cache` caches remain a separate layer during migration.

The route-file denominator is page/layout/route/default/template and executable
metadata conventions (`ts`, `tsx`, `js`, `jsx`, `mdx`), excluding tests and static assets.
At the audited source: Console 4, Docs 66, Ovie 3 source files (220 effective after
route generation), Should I Make 2, Web 809, LYB 75. Total: **959 source files**,
**1,176 effective files** including generated Ovie adapters. These are files,
not unique URLs or eligibility counts. All remain **unknown for complete adoption**;
zero route families are certified aligned and zero gaps were migrated in Slice A.
A source scan finds 462 `runtime`, 188 `dynamic`, 124 `revalidate` and 7
`dynamicParams` declarations across the six source trees. Classify their semantics
before editing, including metadata and generated Ovie adapters.

Representative Web family coverage: `(home)` 2; `(marketing)` 49; `[username]` 20;
`app` 140; `api` 462; remaining families/metadata 136 = 809. Public candidates
need static-shell/metadata testing; signed-in/auth/payment families need streaming,
authorization, freshness and account-switch tests before any cache decision.

AST call inventory: **27 `unstable_cache` calls / 20 production modules** below.
These are migration candidates, not 20 approved mechanical substitutions. Paths
are relative to `apps/web`; unlisted server reads remain unknown, not exceptions.

| Module | Calls | Current boundary / next audit action |
| --- | ---: | --- |
| `app/[username]/[...slug]/_lib/content-candidate.ts` | 1 | Public content; verify identity/negative-cache behavior |
| `app/[username]/[...slug]/page.tsx` | 1 | Public content; inspect shell and metadata |
| `app/[username]/[slug]/_lib/data.ts` | 2 | Public entity projection; preserve visibility checks |
| `app/[username]/_lib/public-profile-loader.ts` | 1 | Handle-keyed profile; retain error exclusion and React request memoization |
| `app/api/admin/campaigns/invites/route.ts` | 1 | Admin data; authorize before any shared boundary |
| `app/api/billing/health/route.ts` | 1 | Freshness-sensitive; verify a bounded lifetime is appropriate |
| `app/api/spotify/search/helpers.ts` | 1 | External search; retain argument and failure semantics |
| `app/app/(shell)/dashboard/audience/audience-data.ts` | 1 | Private audience; audit tenant keys and invalidators |
| `app/app/(shell)/dashboard/contacts/actions.ts` | 1 | Private contacts; audit tenant keys and invalidators |
| `app/app/(shell)/dashboard/tour-dates/actions.ts` | 1 | Tour dates; coordinate public/private projections |
| `app/sitemap.ts` | 1 | Public enumeration; inspect build/revalidation cost |
| `lib/admin/platform-stats.ts` | 1 | Admin aggregate; keep authorization dynamic |
| `lib/changelog-source.ts` | 1 | Build-SHA-keyed file bytes; preserve publication policy on every read |
| `lib/demo-creator.ts` | 1 | One-hour featured-creators dependency/tag |
| `lib/featured-creators.ts` | 3 | Public featured/handle/search; inspect nested TTLs |
| `lib/flags/overrides-store.server.ts` | 1 | Environment-tier key / feature-flags tag; writes own invalidation |
| `lib/homepage-featured-selection.ts` | 1 | Public candidates; preserve selection semantics |
| `lib/profile/public-discovery-catalog.ts` | 2 | Public list/count; preserve filter/count consistency |
| `lib/releases/public-release-loader.ts` | 1 | Immutable profile-ID key / public release tag |
| `lib/releases/release-matrix-loader.ts` | 4 | User/profile/release keys; ownership checks precede caching |

Uncached work must also be assessed: public profile tour dates/merch/collaborators
in `app/[username]/page.tsx`, homepage `generateMetadata`, Docs' article registry
and filesystem reads, and personalized Ovie route adapters. No complete server-read
inventory or eligible-gap denominator exists yet; do not report architectural alignment.

## Capability decisions and maintenance contract

| Capability | Decision for this slice | Falsifiable next evidence / owner |
| --- | --- | --- |
| Cache Components + Partial Prefetching | ADOPT as required maintenance; implementation outstanding in JOV-7987 | Whole-app builds + public shells, metadata, mutations, cache/privacy/navigation tests |
| `ensureStatic` | DEFER application to the rendering slice in JOV-7987 | Assert public marketing/profile code rejects accidental request APIs without breaking valid dynamic work |
| `navigation()` / `prefetch()` | DEFER in JOV-7987 | Compare actual inbox/navigation prefetch requests, compute and latency; no automatic TanStack removal |
| React 19.3 | KEEP existing 19.3.0 | Next peers accept it; independently validate new React APIs before adopting them |
| Stable bundler improvements | ADOPT through patched runtime | Measure actual cold/warm builds/dev sessions; no upstream percentage claimed as local gain |
| Agent upgrade guidance / analyzer | KEEP existing manual upgrade and analyzer | Pin targets; inspect emitted bundles; no new agent feedback/telemetry opt-in |
| Rust compiler, GC, lazy imports, workers, additional roots/global store | DEFER experiments in JOV-7987 | Separate compatibility/resource evidence; workers fall back to processes on Node >=24.13.1; no package-manager migration |

These are scope deviations, **not approved permanent exceptions or completed adoption**.
Tim White / JOV-7987 owns the remaining audit/migrations; last reproduced framework:
16.4.1 on 2026-10-15. Next action: migrate a bounded public/content slice after the
security PR, with app-wide validation. Review by 2026-10-22, or immediately on a
Next default/removal change. Each remaining gap then needs implementation or a
current, individually owned exception with reproducible evidence and review trigger.

Keep server persistence, React request memoization, TanStack and HTTP/CDN caches
distinct. `use cache` defaults to runtime memory; serverless instances do not imply
persistent cross-request/deploy reuse. Evaluate a supported remote handler before
replacing persistent Data Cache entries; no spending or infrastructure is authorized.
[Cache directive semantics](https://nextjs.org/docs/app/api-reference/directives/use-cache).
`lib/queries/server.ts` owns request-local QueryClient/dehydration;
`components/providers/QueryProvider.tsx` and `lib/queries/cache-isolation.ts` fence
browser data on account changes. Keep those owners and mutation invalidation maps;
shared server caches must not contain sessions, authorization or private responses.
Billing status explicitly uses private/no-store response policies. Preserve and
verify those separately from tags. Follow [TanStack SSR guidance](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr).

## Certification and rollback

Local evidence: 18 workspace typecheck tasks, 88 cache/config/isolation tests
and 76 Docs tests passed. All five Jovie production builds passed; the desktop
modal regression passed six tests and the full Storybook matrix passed all 162.
Web build: 4m00s wall / 7,906,960 KiB peak RSS; 28 MiB static, 803 MiB standalone,
1.1 GiB compiler cache. No comparable clean baseline exists, so no framework
speedup is claimed. With the Nextra fix, Docs built in 3m58s / 1,488,976 KiB peak
RSS, generated 66 static entries and indexed 27 pages through normal Pagefind.

Run pinned Node/pnpm, frozen install, explicit `pnpm turbo typecheck`, changed-file
Biome and relevant tests, production builds and the full Storybook surface matrix.
Local isolated fixtures and source tests do not certify deployed customer paths.
The independent gate must obtain exact-SHA hosted CI, Migration Guard, security
scan, affected boundary tests and `llm-review`, then merge/deploy through PR_FLOW.

JOV-7987 retains signup/signin/onboarding and autofill, public profile/claim,
controlled test-mode checkout/entitlement/refund, inbox/navigation, cache mutation
and account-switch, WebKit/iOS Safari, accessibility/visual and shared desktop
certification. LYB-184 owns its web/Capacitor/native patch checks. No real charges.
Record served SHA, runtime and fresh canaries; baseline/after build time, memory,
disk, initial JS, navigation and compute. Missing credentials or stale/unknown
measurements are not passes. Parent JOV-7985 receives the actual coverage and
remaining obligations, not an end-to-end success claim.

Rollback uses the existing production controller's last verified generation;
retain security incident ownership if that generation is vulnerable. Revert the
coherent dependency/lockfile/Storybook patch commit for source rollback, without
inventing a Next 15 downgrade or bypassing CI. Re-certify the served runtime.
