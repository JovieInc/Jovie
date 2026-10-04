# Product audit follow-up — self-review gap completion (JOV-7633)

Date: 2026-10-03. Scope: the seven areas the wave-2 product audit left
incomplete. Method notes and evidence limits are inline per section.

Follow-on issues filed (all children of JOV-7633):

| Issue | Area |
|---|---|
| JOV-7727 | API routes with no in-repo caller |
| JOV-7729 | Unused Drizzle column `click_events.os` |
| JOV-7730 | iOS push deep links dead-end |
| JOV-7731 | Dead iOS feature-intro surface |
| JOV-7732 | Retired skip blocks + `it.todo` census |
| JOV-7733 | Feature-flag override drift |
| JOV-7734 | Never-mounted components |

## 1. Settings sections: tabs but not routes

Clean. Every entry in `userSettingsNavigation` /
`artistSettingsNavigation` (`components/features/dashboard/dashboard-nav/config.ts`)
maps to a directory under `app/app/(shell)/settings/`: account, connectors,
usage, billing, data-privacy, payments (gated on Stripe Connect),
artist-profile, contacts, touring, analytics, audience.

Three extra route dirs are legacy redirect stubs, not tabs:
`settings/admin` → `/admin/ops`, `settings/profile` → `settings/artist-profile`,
`settings/delete-account` → `settings/data-privacy`.

Note (minor, no issue filed): in-page sub-sections inside settings pages
(e.g. security / theme / notifications inside Account) are not deep-linkable —
there is no `?section=` or anchor routing. If support wants to link users to a
specific setting, this becomes a real gap.

## 2. API route handlers with no UI caller → JOV-7727

Method: enumerated 451 `app/api/**/route.ts` handlers; for each of the 378
static paths, full-text search for `api/<path>` across the repo excluding the
handler dir and `openapi.json` (tests count as a caller). cron/* routes are
invoked via `vercel.json` and are excluded from findings.

19 static routes have zero in-repo callers. Verified notable ones:

- `api/feature-flags` — admin-gated GET of all code flags; admin UI fetches
  `api/admin/feature-flags` instead. Likely superseded dead route.
- `api/dashboard/approvals`, `api/referrals/{apply,code,stats}`,
  `api/dsp/bio-sync/status`, `api/youtube-library/links`,
  `api/pre-save/spotify/start`, `api/connectors/youtube/thumbnails/apply`,
  `api/merch/mockups`, `api/admin/ingestion-health`,
  `api/admin/hud/what-shipped`, `api/hud/hermes-events`,
  `api/ovie/{certifications/metrics,ingest}`,
  `api/internal/ovie/lyb-mrr`,
  `api/internal/release-communications/merge-events`,
  `api/ops/humanize-pr-title`, `api/release-to-revenue/trigger`,
  `api/dashboard/retargeting/attribution`, `api/dev/test-user/set-trial-state`.

Known false-negative class: callers that build URLs via constants or external
systems (Ovie, Hermes, GitHub workflows, iOS) — JOV-7727 includes the
verification step before deletion.

## 3. Unused Drizzle columns → JOV-7729

Method: extracted all camelCase column property names from
`apps/web/lib/db/schema/*.ts` (1357 unique names), diffed against every
identifier token in the repo outside the schema and migrations dirs.

One column is never referenced outside the schema directory:
`click_events.os` (`lib/db/schema/analytics.ts:325`). The table is read for
`creatorProfileId`, `linkType`, `isBot`, `createdAt`, `audienceMemberId`,
`metadata` — `os` is neither selected nor written (browser and deviceType are).

Limit: names ≤2 chars needed a manual pass (`id`, `os`); `id` is used
everywhere, `os` only in this one place.

## 4. Email/push deep links

Email: every deep link target in `lib/email/templates/*` resolves to a real
route — `/claim/[token]`, `/changelog`, `/api/changelog/{verify,unsubscribe}`,
`/api/audience/unsubscribe`, `/settings/billing`, `/support`, `/{username}`.
Clean.

Push: dead end — JOV-7730. Server puts `ctaUrl` into the APNs payload as
`url` (`lib/notifications/push.ts:121`); the iOS app implements
`willPresent` but no `didReceive response` handler, so taps drop the link.
Only producer is campaign scheduling (fan notifications).

## 5. Live DB flag overrides vs defaults → JOV-7733

Read live `feature_flag_overrides` from the dev database (doppler
`jovie-web/dev`, 2026-10-03). Production DB not inspected — the same query
should be re-run against prod before acting.

- Stale row: `code:DESIGN_V1` (dev=t, prod=t) — flag family retired; an e2e
  spec already asserts the route ignores the stale override.
- Permanent drift: `INBOX_HOME`, `PROFILES_WORKSPACE`,
  `PROFILE_SEARCH_MONITORING` are overridden ON in all three envs while code
  defaults are `false` → flip defaults or retire the flags.
- No-op rows duplicating `true` defaults: `BILLING_UPGRADE_DIRECT`,
  `PLAYLIST_ENGINE`, `MERCH_MVP`, `APPLE_WALLET_PROFILE_PASS`,
  `TELEPROMPTER_RECORDING`, `RELEASE_TO_REVENUE_AUTOPILOT`,
  `AI_CONNECTORS_BETA`.

## 6. `it.skip` / `test.todo` census → JOV-7732

~473 skip/todo markers in `apps/web/tests`. Breakdown:

- ~418 are runtime-conditional `test.skip(cond, reason)` env gates in
  Playwright e2e (profile not seeded, DATABASE_URL absent, canary envs) —
  legitimate.
- 3 `it.todo`: `unit/auth/waitlist-gating.test.ts:822,849`,
  `unit/ladygaga-seed.test.ts:4`.
- Retired-but-compiled dead skips: `proxy-behavioral.test.ts` (10+
  `describe.skip`/`it.skip` blocks annotated "retired: Better Auth"),
  `proxy-composition.critical.test.ts:329`, `native-complete-page.test.tsx`
  (3), `signin-page.test.tsx` (2), `tooltip.test.tsx` (2).

## 7. Components never mounted + iOS screens outside the manifest → JOV-7734, JOV-7731

Web: name-based scan of 1325 non-test component files under
`apps/web/components` — ~80 components appear only in their own file plus
stories/tests. Verified:

- `CanvasGrain` — never mounted while code flag `CANVAS_GRAIN` defaults
  `true`: a live flag guarding dead UI.
- `CinematicAppBoot`, `FounderConversionHud`, `FeatureShowcase`, plus the
  large `features/home/*` marketing-section cluster (~30 files) that looks
  like a retired homepage revision, HUD admin cards, profile cards, and
  assorted panels. Full list in JOV-7734. Caveat: marketing sections could
  be composed under different identifiers — verify before deleting.

iOS manifest (`apps/ios/Jovie/App/AppRouteManifest.swift`, 24 source files):
every mounted screen in `Jovie/Features` and `Jovie/App` is either listed in
the manifest or is a sub-view/sheet mounted from a listed parent. The dead
surface is `FeatureIntroHost` / `FeatureIntroCard` / `FeatureIntroCatalog` —
never mounted (a test even asserts the host is absent) and not in the
manifest.

## Evidence gaps

- prod `feature_flag_overrides` not read (dev DB only) — JOV-7733 carries it.
- `account/delete`-style routes callable only via test files are counted as
  having callers; external-contract routes may be under-flagged, not over.
- The components scan is name-based; barrel re-exports and page-builder
  composition by slug are not fully resolved (JOV-7734 has the caveat).
- gbrain and the Linear MCP were unavailable; issues were filed via the
  Linear API using `LINEAR_API_KEY` from doppler `jovie-web/dev`.
