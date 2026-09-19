# Help Center V1 migration map

Status: locked implementation input for JOV-5894, JOV-5895, JOV-5896,
JOV-5898, JOV-5899, JOV-5901, JOV-5902, and JOV-5903
Source issue: JOV-5893
Audit date: 2026-09-19
Content owner today: repository fallback owner `@itstimwhite`; no article-level
editorial or certification owner is encoded
Runtime impact: none; this file inventories and maps current source only

## Decision

The V1 Help Center remains on `https://docs.jov.ie` and keeps `/docs` as the
canonical route prefix. The canonical home is `https://docs.jov.ie/docs`.
`https://docs.jov.ie/` permanently redirects there. This preserves the largest
set of current external URLs and avoids moving the API reference contract only
to remove one path segment.

Every URL in this document must resolve in one hop to either a canonical page
or a deliberate category landing. Query strings are preserved. No legacy URL
may redirect to another legacy URL.

The Help Center is creator-first. Developer material is retained under
`/docs/developers`, but it is absent from the six primary home cards.

### Why this map exists

- **Bottleneck:** the existing MDX presents article existence as product truth,
  while its routes, interface labels, pricing, and availability claims have
  drifted from the current product.
- **Evidence:** 26 tracked MDX pages have title-only frontmatter; current app
  routes and labels disagree with multiple articles; no current article carries
  certification evidence.
- **Success metric:** JOV-5896 can implement a deterministic fixture in which
  every legacy URL has exactly one canonical outcome, and JOV-5899 can attach
  every public guide to an existing route and feature ID without inventing
  certification.

### Route policy

- Keep the `/docs` prefix on the docs host.
- Use lowercase kebab-case canonical paths.
- Preserve all 26 tracked MDX URLs plus the broken support-page URL.
- Preserve `support.jov.ie` as the existing cross-domain support redirect.
- Use category landings for retired or uncertified detail pages. Do not keep
  unsupported claims public merely to preserve a URL.
- Keep redirects permanent and single-hop.

## Locked V1 information architecture

| Section | Canonical landing | Navigation items |
|---|---|---|
| Jovie essentials | `/docs/jovie-essentials` | Start here; Find or claim your profile; Connect Spotify, Apple Music, or YouTube; Complete your profile; Publish your profile; Share your Jovie link |
| Build your presence | `/docs/build-your-presence` | Profile and identity; Releases and smart links; Audience; Insights and analytics; Jovie assistant; Payments and support |
| Manage Jovie | `/docs/manage-jovie` | Account and login; Plans and billing; Integrations; Privacy and data; Troubleshooting; Contact support |
| Developers | `/docs/developers` | API and technical documentation |

The sidebar label is the exact text above even when it points to an article
nested under another section. This avoids duplicate content. For example,
`Complete your profile` links to the canonical edit-profile guide under
`Profile and identity`.

## Certification vocabulary

The existing feature registry distinguishes shipped source from certified
outcomes. `apps/web/lib/ovie/mcp/artist-profile-inventory.ts` explicitly maps a
`Shipped` registry row to `implemented`, not `certified`. This audit uses:

- **Implemented, uncertified:** a current route and product source exist, often
  with deterministic tests, but no launch-guide outcome certification exists.
- **Verified, uncertified:** an internal-default-on registry row has stronger
  source evidence but still no outcome certification.
- **Incomplete:** part of the proposed guide exists, but the exact promised
  workflow or unified surface does not.
- **Unavailable:** no creator-facing workflow exists; only fallback support or
  internal operations exist.
- **Machine-certified / human-certified:** only the JOV-5899 metadata and
  certification contract may confer these states.

At audit time, **0 of 14 V1 guides are machine-certified and 0 of 14 are
human-certified**. Source tests are evidence, not certification. JOV-5901,
JOV-5902, and JOV-5903 own human certification on the exact candidate build.

## Current MDX route and content inventory

All 26 pages have `title` frontmatter only. The `Description` column is
therefore `missing` for every row. None has a stable article ID, document type,
category, product route, feature ID, keywords, aliases, owner, verification
date, verification actor, status, or visual proof reference. The current
fallback code owner is the global `@itstimwhite`; article-level ownership is
**unassigned**.

Disposition values describe what JOV-5896 and the guide-writing issues must do.
They do not change public content in JOV-5893.

| Current route | Current title | Description | Current navigation location | Finding | Disposition | Canonical destination |
|---|---|---|---|---|---|---|
| `/` | Jovie Documentation | missing | Top-level `Home` | Duplicate of `/docs`; product-led copy is uncertified | redirect | `/docs` |
| `/docs` | Docs | missing | Top-level `Documentation` | Generic type-first home | rewrite | `/docs` |
| `/docs/getting-started` | Getting Started | missing | Documentation > Getting Started | Combines account, handle, DSP, profile, and share steps using old behavior | merge | `/docs/jovie-essentials/start-here` |
| `/docs/features` | Features | missing | Documentation > Features | Product-inventory navigation, not customer-task navigation | redirect | `/docs/build-your-presence` |
| `/docs/plans-pricing` | Plans & Pricing | missing | Documentation > Plans & Pricing | Stale prices, annual offer, feature availability, and AI quotas | redirect | `/docs/manage-jovie/plans-and-billing` |
| `/docs/api-reference` | API Reference | missing | Documentation > API Reference | Current developer-only contract; creator placement is wrong | keep | `/docs/developers/api-reference` |
| `/docs/self-serve-guide` | Guides | missing | Documentation > Guides | Duplicate guide index organized by legacy content | redirect | `/docs/jovie-essentials` |
| `/docs/self-serve-guide/claim-handle` | Claim Your Handle | missing | Guides | Misleading: current claim starts on an unclaimed profile and verifies through auth/Spotify, not Settings > Profile | redirect | `/docs/jovie-essentials/find-or-claim-your-profile` |
| `/docs/self-serve-guide/connect-dsps` | Connect DSPs | missing | Guides | Stale route and OAuth model; current Settings > Connections is Google-only | rewrite | `/docs/jovie-essentials/connect-music-accounts` |
| `/docs/self-serve-guide/set-up-profile` | Set Up Your Profile | missing | Guides | Stale featured-content and standalone `Public` toggle instructions | rewrite | `/docs/build-your-presence/profile-and-identity/edit-profile` |
| `/docs/self-serve-guide/share-first-link` | Share Your First Smart Link | missing | Guides | Uses retired Dashboard > Links and mixes profile sharing with release sharing | merge | `/docs/build-your-presence/releases-and-smart-links/add-release-or-smart-link` |
| `/docs/self-serve-guide/set-up-tipping` | Set Up Tipping | missing | Guides | Uncertified Venmo, tip-page, and earnings claims; not in the launch guide set | hide | `/docs/build-your-presence/payments-and-support` |
| `/docs/self-serve-guide/set-up-ad-pixels` | Set Up Ad Pixels | missing | Guides | Old Settings > Ad Pixels path; third-party steps and tracked-event claims are uncertified | hide | `/docs/manage-jovie/integrations` |
| `/docs/self-serve-guide/connect-bandsintown` | Connect Bandsintown | missing | Guides | Source route exists, but sync timing and behavior are not human-certified for V1 | hide | `/docs/manage-jovie/integrations` |
| `/docs/features/profile` | Profile | missing | Features > Profile | Mixes current, stale, gated, and uncertified sub-page claims | rewrite | `/docs/build-your-presence/profile-and-identity` |
| `/docs/features/profile/tour-dates` | Tour Dates | missing | Features > Profile > Tour Dates | Uncertified sync, timing, geolocation, and all-plan claims | hide | `/docs/manage-jovie/integrations` |
| `/docs/features/profile/verified-badge` | Verified Badge | missing | Features > Profile > Verified Badge | Misleading: paid plan entitlement is presented as automatic identity verification | hide | `/docs/build-your-presence/profile-and-identity` |
| `/docs/features/releases` | Releases & Smart Links | missing | Features > Releases & Smart Links | Over-broad provider, deep-link, pre-save, notification, and MusicFetch claims | rewrite | `/docs/build-your-presence/releases-and-smart-links` |
| `/docs/features/audience` | Audience | missing | Features > Audience | Uses retired `/dashboard/audience` and overstates anonymous identity and scoring | rewrite | `/docs/build-your-presence/audience` |
| `/docs/features/audience/crm` | Fan CRM | missing | Features > Audience > Fan CRM | Uses retired `/dashboard/contacts`; role, territory, channel, and export claims need certification | hide | `/docs/build-your-presence/audience` |
| `/docs/features/analytics` | Analytics | missing | Features > Analytics | Uses nonexistent `/dashboard/analytics`; tables mix implemented and aspirational behavior | rewrite | `/docs/build-your-presence/insights-and-analytics` |
| `/docs/features/analytics/ai-insights` | AI-Powered Insights | missing | Features > Analytics > AI-Powered Insights | Current `/app/insights` exists, but inputs, ranking, persistence, and plan claims are uncertified | hide | `/docs/build-your-presence/insights-and-analytics` |
| `/docs/features/analytics/ad-pixels` | Ad Pixel Tracking | missing | Features > Analytics > Ad Pixel Tracking | Old settings label/path and uncertified event-forwarding claims | hide | `/docs/manage-jovie/integrations` |
| `/docs/features/chat-ai` | AI Assistant | missing | Features > AI Assistant | Old sidebar model, daily quotas, and broad direct-edit claims conflict with current weekly entitlements and chat UX | rewrite | `/docs/build-your-presence/jovie-assistant` |
| `/docs/features/tips` | Tips & Payments | missing | Features > Tips & Payments | Uncertified Venmo, instant tipping, message, payout, and `/tip` claims | hide | `/docs/build-your-presence/payments-and-support` |
| `/docs/features/retargeting-ads` | Retargeting Ads | missing | Features > Retargeting Ads | Old settings route and unsupported form-submission/purchase event claims | hide | `/docs/manage-jovie/integrations` |

### Current content defects by class

- **Duplicate:** `/` and `/docs`; `getting-started` and `self-serve-guide` repeat
  the same activation journey; feature pages and guides repeat capability copy.
- **Stale routes:** `/dashboard/insights`, `/dashboard/analytics`,
  `/dashboard/audience`, `/dashboard/contacts`, Dashboard > Links,
  Settings > Integrations, Settings > Ad Pixels, and Dashboard > Earnings.
- **Misleading:** paid plan equals verified identity; publish is a simple
  `Public` toggle; every DSP uses one OAuth flow; tips and pixel events work as
  described; support responds within one business day.
- **Broken:** the support card and FAQ use
  `https://docs.jov.ie/getting-started`, while the tracked route is
  `/docs/getting-started`. A 2026-09-19 live check also returned HTTP 503 with
  Vercel `x-vercel-error: DEPLOYMENT_PAUSED` for the docs host root, `/docs`,
  and both getting-started paths.
- **Developer-only:** API Reference is valid but currently peer-level with
  creator onboarding.
- **Uncertified:** every creator article. Article presence is not capability
  certification.

## Existing support and entry-point inventory

| Entry point | Current label or behavior | Current destination | V1 destination / action |
|---|---|---|---|
| `docs.jov.ie` root and `/docs` | Current documentation host and source-backed home | HTTP 503 `DEPLOYMENT_PAUSED` at audit time | Retain the host and make `/docs` canonical in JOV-5894; source completion does not prove hosted availability |
| `support.jov.ie` host in `apps/web/proxy.ts` | Retired support host | `https://jov.ie/support`, query preserved, old path discarded | Keep as a permanent cross-domain fallback; do not use as a Help Center canonical host |
| Marketing header, footer, mobile nav, homepage copy, and no-script copy | `Support` or `Contact support` | `/support` | Keep `/support`; change its primary documentation action to `https://docs.jov.ie/docs` |
| Signed-in user menu | `Help` | opens `/support` in a new tab | Keep; `/support` remains the stable app help exit |
| Account dashboard | `Contact Support`; `View Documentation` | `/support`; `https://docs.jov.ie` | Keep support; point documentation directly to `https://docs.jov.ie/docs` |
| Billing dashboard and billing success | `Contact Support` / `Contact support` | `/support` | Keep |
| Auth shell trouble action | `Trouble signing in?` | `/support` | Keep |
| Account creation failure | `Contact support` | `mailto:support@jov.ie?subject=Account%20Setup%20Error` | Keep as direct failure fallback |
| Onboarding failure footer | `Contact support` | `mailto:support@jov.ie` | Keep as direct fallback |
| Smart-link limit gate | email support | `mailto:support@jov.ie?subject=Smart%20link%20limit%20increase%20request` | Keep until the limit workflow changes; do not expose as a general Help Center guide |
| Dashboard analytics card | `See Sharing Tips` | `/support` | Rewrite the link label and destination in JOV-5896; current label does not match the generic support page |
| Audience table fallback | support action | `/support` | Keep |
| AI, investor, voice, and developer marketing pages | `Contact The Team`, `Talk to the team`, or support link | `/support` | Keep as marketing support entry points |
| Pricing and enterprise offer | `Contact sales` | `mailto:support@jov.ie` | Keep as a sales contact path; do not present it as general Help Center navigation |
| Developer page | Documentation / API reference | docs root and `/docs/api-reference` | Point to `/docs/developers` and `/docs/developers/api-reference` |
| Agent-readable homepage and `llms.txt` surfaces | Docs and Support URLs | docs root and `/support` | Emit the canonical `/docs` Help Center URL plus `/support` |
| Public API contract | API reference URL | `https://docs.jov.ie/docs/api-reference` | Permanent redirect to `/docs/developers/api-reference`; update the advertised canonical URL in JOV-5896 |
| Paid welcome email | support URL | `/support` | Keep |
| `packages/auth-routing` | allowlisted docs origin and support path | `https://docs.jov.ie`; `/support` | Keep origin/path policy; no new host |

### Source-exact production reference ledger

This ledger distinguishes clickable/contact surfaces from route-policy and
analytics references. Tests, stories, and fixtures are evidence for these
surfaces, not additional customer entry points.

| Reference class | Tracked source locations | Audit result |
|---|---|---|
| Support page links and FAQ | `apps/web/app/(marketing)/support/SupportContent.tsx`; `apps/web/components/organisms/SupportPageContent.tsx`; `apps/web/app/(marketing)/support/page.tsx`; `apps/web/app/[username]/[slug]/PreferredDspRedirect.tsx` | Three channel links, four FAQs, and the final email CTA are inventoried below; two `/getting-started` references are broken, preferred-DSP behavior is overstated, and the response-time promise is uncertified |
| Marketing navigation and homepage | `apps/web/components/organisms/HeaderNav.tsx`; `apps/web/components/site/MarketingHeader.tsx`; `apps/web/components/organisms/footer-module/Footer.tsx`; `apps/web/components/homepage/HomepageNoScriptContent.tsx`; `apps/web/data/homepageV2Copy.ts`; `apps/web/data/marketingNavigation.ts`; `apps/web/data/marketing/pageContracts.ts` | Current links intentionally enter `/support`; no direct article deep link |
| Signed-in help menu | `apps/web/components/organisms/user-button/UserButton.tsx` | `Help` opens `/support` in a new tab |
| iOS settings | `apps/ios/Jovie/Features/Settings/SettingsView.swift` | `Support` opens `https://jov.ie/support`; retain as the native app help exit |
| Account and billing help | `apps/web/components/organisms/AccountDashboard.tsx`; `apps/web/components/organisms/BillingDashboard.tsx`; `apps/web/app/billing/success/page.tsx` | `/support` is retained; the account dashboard docs-root link must move to canonical `/docs` |
| Auth, onboarding, and account-error fallback | `apps/web/components/features/auth/AuthShell.tsx`; `apps/web/components/features/dashboard/organisms/onboarding-v2/OnboardingV2Form.tsx`; `apps/web/app/error/user-creation-failed/page.tsx`; `apps/web/app/(dynamic)/legal/error.tsx` | `/support`, direct support email, or displayed support address; retain as failure-path contact, not article navigation |
| Dashboard contextual help | `apps/web/components/features/dashboard/organisms/DashboardAnalyticsCards.tsx`; `apps/web/components/features/dashboard/organisms/dashboard-audience-table/DashboardAudienceTableUnified.tsx`; `apps/web/components/features/dashboard/organisms/release-provider-matrix/SmartLinkGateBanner.tsx` | Generic `/support` or email fallback; `See Sharing Tips` is the only label/destination mismatch |
| Marketing CTAs | `apps/web/app/(marketing)/ai/page.tsx`; `apps/web/app/(marketing)/investors/page.tsx`; `apps/web/app/(marketing)/developers/page.tsx`; `apps/web/components/organisms/VoicePageContent.tsx`; `apps/web/components/organisms/PricingRecipeBody.tsx`; `apps/web/lib/config/plan-prices.ts` | Retain support CTAs; the pricing/enterprise `Contact sales` action emails support; developer docs links move under `/docs/developers` |
| Agent-readable and API surfaces | `apps/web/app/llms.txt/route.ts`; `apps/web/app/llms-full.txt/route.ts`; `apps/web/lib/agent/homepage-markdown.ts`; `apps/web/lib/agent/site-llms-guidance.ts`; `apps/web/lib/api/v1/contract.ts` | Advertise `/docs`; retain `/support`; redirect the old API reference and update its canonical contract URL |
| Email and long-form content | `apps/web/lib/email/templates/paid-welcome.ts`; `apps/web/lib/email/paid-welcome.ts`; `apps/web/content/blog/the-friday-problem.md` | Paid welcome links to `/support`, displays the support address, and uses it as `replyTo`; the blog contains a support-address mention, not Help Center navigation |
| Third-party task/setup assistance | `apps/web/components/features/dashboard/organisms/SettingsAdPixelsSection.tsx`; `apps/web/components/features/dashboard/organisms/socials-form/VerificationModal.tsx`; `apps/web/lib/release-tasks/default-template.ts`; `apps/web/drizzle/migrations/0038_release_task_catalog_seed.sql` | Facebook, Google, TikTok, DNS-provider, distributor, Apple, Spotify, MusicBrainz, and Discogs links support in-product tasks but are not Jovie Help Center entry points; do not copy them into V1 without rechecking the exact vendor URL |
| Canonical constants and host redirect | `apps/web/constants/domains.ts`; `apps/web/constants/routes.ts`; `apps/web/lib/notifications/config.ts`; `apps/web/proxy.ts`; `apps/web/lib/auth/proxy-request-handler.ts` | `DOCS_URL`, the support address, `/support`, retired `support.jov.ie`, and auth-failure support targets remain canonical source boundaries |
| Native/desktop URL policy, not links | `apps/desktop/src/navigation.ts`; `packages/auth-routing/index.ts`; `apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift` | Docs origin and `/support` are allowlisted/reserved for safe navigation; these files do not add a customer-facing Help Center link |
| Route metadata, structured data, reserved-path, and analytics policy, not links | `apps/web/data/marketing/routeManifest.ts`; `apps/web/lib/seo/ratchet-baseline.json`; `apps/web/lib/constants/schemas.ts`; `apps/web/lib/routing/proxy-routing.ts`; `apps/web/scripts/performance-route-manifest.ts`; `apps/web/components/providers/CoreProviders.tsx`; `apps/web/components/providers/InstantlyPixel.tsx`; `apps/web/components/marketing/MarketingEmailSignup.tsx`; `apps/web/components/site/MarketingFooter.tsx`; `apps/web/lib/sections/variants/faq.tsx`; `apps/web/lib/sections/variants/header.tsx`; `apps/web/lib/theme/route-policy.ts`; `apps/web/lib/services/ai-crawler-analytics/attribute.ts`; `apps/web/lib/validation/username-core.ts`; `apps/web/lib/ingestion/strategies/beacons/config.ts` | `/support` remains a reserved, structured, and measured marketing route; these references do not create additional content destinations |

### `/support` content inventory

- Hero: `Support`; `We're Here To Help.`; `Browse our docs or reach out to
  our team.`
- Channel 1: `Documentation`, `Guides, tutorials, and walkthroughs.`, `Visit`,
  `https://docs.jov.ie`.
- Channel 2: `Email Support`, `Reach our team directly.`, `Send email`,
  `mailto:support@jov.ie`.
- Channel 3: `Getting Started`, `New to Jovie? Start here.`, `Visit`, broken
  `https://docs.jov.ie/getting-started`.
- FAQ: getting started; smart links; plan upgrades; contact support.
  - Rewrite getting started against the locked launch path and canonical URL.
  - Rewrite smart links: the current claim that Jovie detects every fan's
    preferred platform is too broad. Automatic routing requires an explicit
    `dsp` query parameter or a previously stored `jovie_dsp` preference cookie;
    otherwise the release page does not redirect.
  - Keep the Settings > Billing direction, using the current `Billing` label.
  - Keep the support email but remove the uncertified response-time promise.
- Final CTA: `Still Need Help?`, `Contact Support`,
  `mailto:support@jov.ie`.
- The FAQ currently promises a one-business-day response. That SLA is not
  enforced in product source and must not be carried into V1.

The support page remains a small contact/fallback surface. It must not become a
second article registry or duplicate Help Center navigation.

Live entry-point snapshot on 2026-09-19: `https://support.jov.ie/example?source=audit`
resolved to `https://jov.ie/support?source=audit` with HTTP 200, proving the
retired-host query-preservation behavior. `https://docs.jov.ie/`, `/docs`,
`/getting-started`, and `/docs/getting-started` all returned HTTP 503 with the
Vercel `DEPLOYMENT_PAUSED` header. That is observed runtime evidence only; this
issue does not resume, deploy, or reconfigure the docs project.

### External URL audit

This is the complete external-URL set embedded in the tracked MDX plus the docs
shell edit link. HTTP results were checked with redirects followed on 2026-09-19.
An HTTP 200 proves reachability only; product claims still require the source and
certification evidence above.

| Current external URL or family | HTTP result | V1 disposition |
|---|---|---|
| `https://jov.ie` and `https://jov.ie/pricing` | 200 | Keep; current marketing destinations |
| `https://jov.ie/api/v1`, `/api/v1/openapi.json`, and `/openapi.json` | 200 | Keep as developer-only contract links |
| `https://jov.ie/api/v1/{username}` | route template | Keep in developer documentation; it is a template, not a literal fetch target |
| `https://jov.ie/developers` and `https://jov.ie/api-versioning` | 200 | Keep as developer-only destinations |
| `https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-11` | 200 | Keep in the developer API reference |
| `https://business.facebook.com/events_manager` | 200 | Reachable but third-party/auth-gated; exclude from V1 until the ad-pixel guide is certified |
| `https://github.com/ArtistFirst/Jovie/tree/main/apps/docs` | **404** | Stale old edit-repository path; replace or remove the public edit control |
| `https://github.com/JovieInc/Jovie/tree/main/apps/docs` | 200 | Valid replacement only if public repository editing remains intended |

The in-product third-party assistance sources named in the reference ledger
contain 29 unique URLs. A 2026-09-19 anonymous HTTP check followed redirects:

- 22 resolved with HTTP 200. Spotify and TikTok moved to equivalent, specific
  canonical help pages.
- Seven returned HTTP 403: Symphonic, Discogs, TuneCore, UnitedMasters, ASCAP,
  and two BMI URLs. Treat these as anonymously unverifiable, not proven dead.
- `https://support.google.com/domains/answer/3290350` now lands on the generic
  Google Support home. It is stale for DNS verification instructions and must
  not be copied into a V1 guide.
- `https://www.playnetwork.com/` now lands on the generic Mood Media home. Its
  task relevance is uncertified and it must not be copied into a V1 guide.

These vendor links remain outside the Help Center registry. The implementation
issues must recheck a vendor-specific destination before surfacing one in a
public guide.

## V1 launch guide and product-truth map

`Feature registry ID` uses the current deterministic slug only where
`artist-profile-inventory.ts` actually exposes one. The broader feature
registry stores feature names, not stable IDs, so those cells remain `missing`
and name the matching registry row. `missing` is deliberate evidence for
JOV-5899, not permission to invent an ID or production claim. Routes and labels
come from current product source, not the old MDX.

| Article ID and canonical Help URL | Product route | Exact current UI labels | Feature registry ID | Current product/certification state | Primary source evidence |
|---|---|---|---|---|---|
| **Start here** — `start-here` `/docs/jovie-essentials/start-here` | `/start`, then state-dependent auth/onboarding routes | `Find yourself`; page metadata `Start with Jovie` | none, journey index | Implemented, uncertified; human pending | `data/marketing/pageContracts.ts`, `app/(dynamic)/start/page.tsx` |
| **Find your Jovie profile** — `find-your-profile` `/docs/jovie-essentials/find-or-claim-your-profile/find-your-profile` | `/start`; public `/{username}` result | `Find yourself` | `public-profile-pages` | Implemented, uncertified; search result selection needs candidate-build human proof | marketing contract; public profile route |
| **Claim your profile** — `claim-your-profile` `/docs/jovie-essentials/find-or-claim-your-profile/claim-your-profile` | `/{username}/claim?next=auth`, then `/signup` or `/start` | `Claim Profile`; `Continue Claim`; `Verify & Claim`; auth page `Log in to Jovie` | `public-profile-pages`; no claim-specific registry ID | Implemented, uncertified; unsupported profiles have no CTA by design | `features/profile/ClaimBanner.tsx`, `[username]/claim/route.ts` |
| **Create an account or log in** — `create-account-or-log-in` `/docs/manage-jovie/account-and-login/create-account-or-log-in` | `/signup`; `/signin` | `Continue to Jovie`; `Sign in`; `Log in to Jovie` | missing: `account-authentication` | Implemented, uncertified | auth page clients and auth copy |
| **Connect your music accounts** — `connect-music-accounts` `/docs/jovie-essentials/connect-music-accounts` | `/app/library?view=releases`; YouTube import also lives in Library | `Library`; `Releases`; `Connect Spotify`; `Apple Music`; `Import YouTube` | `auto-sync-from-spotify`; `auto-dsp-detection-linking`; missing provider-specific IDs | **Incomplete:** Spotify, Apple Music, and YouTube exist through different controls; no unified Settings > Connections DSP flow | Library surface; release provider matrix; settings connections proves Google-only scope |
| **Fix the wrong artist or catalog** — `fix-wrong-artist-or-catalog` `/docs/manage-jovie/troubleshooting/fix-wrong-artist-or-catalog` | no complete creator self-service route; `/support` and email fallback | `Contact Support`; `Send email` | missing: `catalog-correction` | **Unavailable** as one self-service workflow; support escalation only | support page and current profile suggestion/review sources |
| **Edit your name, bio, images, and links** — `edit-profile` `/docs/build-your-presence/profile-and-identity/edit-profile` | `/app/settings/artist-profile` | sidebar `Artist Profile`; page `Artist`; panel `Profile`; `View as Visitor`; `Links, music & more` | `artist-bio-social-links` | Implemented, uncertified | settings sidebar and `ArtistProfileContent.tsx` |
| **Publish your profile** — `publish-your-profile` `/docs/jovie-essentials/publish-your-profile` | `/start` onboarding and profile completion logic; public result `/{username}` | no standalone `Publish profile` control exists | `public-profile-pages` | **Incomplete:** publication is state-driven; old `Public` toggle instructions are false | onboarding publishability helpers and creator-profile action |
| **Share your Jovie link** — `share-your-jovie-link` `/docs/jovie-essentials/share-your-jovie-link` | profile action menu and `/{username}` | `Copy Link`; `Open Profile`; success `Copied` | `public-profile-pages` | Implemented, uncertified | `dashboard-nav/ProfileMenuActions.tsx` |
| **Add a release or create its link** — `add-release-or-smart-link` `/docs/build-your-presence/releases-and-smart-links/add-release-or-smart-link` | `/app/library?view=releases` | `Library`; `Releases`; `Connect Spotify`; release action `Copy Link` | `auto-sync-from-spotify`; missing for registry rows `Manual release creation` and `Smart link editing and customization` | Implemented, uncertified; provider-specific success states need human proof | Library and release-provider source; feature and entitlement registries |
| **Understand basic visitor and audience data** — `understand-audience-data` `/docs/build-your-presence/audience/understand-audience-data` | `/app/contacts?tab=audience`; `/app/insights` for insight cards | shell `Contacts`; tab `Audience`; `Insights` | missing for registry rows `Audience intelligence (device, location, intent)`, `Click & visit tracking`, and `AI-powered insights` | Implemented, uncertified; metric definitions and low-data behavior remain human-certification work | contacts page, audience table, insights page |
| **Manage your subscription** — `manage-your-subscription` `/docs/manage-jovie/plans-and-billing/manage-your-subscription` | `/app/settings/billing`; external Stripe portal when available | sidebar `Billing`; page `Billing`; `Manage in Stripe`; `Compare plans` | missing for registry row `Direct upgrade checkout flow` | Registry status is `Shipped (internal v1 default-on)`; guide is uncertified | settings billing page/section and entitlement registry |
| **Manage privacy and account data** — `manage-privacy-and-account-data` `/docs/manage-jovie/privacy-and-data/manage-privacy-and-account-data` | `/app/settings/data-privacy` | `Data & Privacy`; `Export your data`; `Export data`; `Delete your account`; `Permanently Delete Account` | missing: `account-data-export`; missing: `account-deletion` | Implemented, uncertified; destructive-action wording needs human review | settings sidebar and `DataPrivacySection.tsx` |
| **Contact support or report incorrect data** — `contact-support-or-report-incorrect-data` `/docs/manage-jovie/contact-support/contact-support-or-report-incorrect-data` | `/support`; `mailto:support@jov.ie` | `Contact Support`; `Email Support`; `Send email` | missing: `support-escalation` | Support contact is implemented; **contextual incorrect-data report is unavailable** | support page and support constants |

### Product-route corrections that downstream guides must use

| Old assumption | Current truth |
|---|---|
| Dashboard > Links | `Library` at `/app/library`, with the `Releases` view |
| `/dashboard/audience` | canonical audience view is `/app/contacts?tab=audience`; `/app/audience` redirects there |
| `/dashboard/contacts` | `/app/contacts` |
| `/dashboard/insights` | `/app/insights` |
| `/dashboard/analytics` | no canonical route; use Audience and Insights according to the task |
| Settings > Integrations for Spotify/Apple/YouTube | Settings `Connections` at `/app/settings/connectors` is Gmail/Google Calendar; music lives in Library/Releases and provider-specific controls |
| Settings > Ad Pixels | old route redirects to `/app/settings/audience`; UI/settings wording must be reverified before any guide |
| Settings > Billing for the full billing dashboard | `/app/settings/billing` shows plan status and actions; detailed management may open Stripe |
| Toggle `Public` to publish | no standalone current control; publication derives from claim/onboarding/profile completion state |
| Pro automatically means verified identity | `canBeVerified` is an entitlement, not proof that a person or profile was human-verified |

## Legacy URL to canonical URL redirects

All redirects below are permanent. Paths are relative to
`https://docs.jov.ie` unless another host is shown.

| Old URL | Canonical URL |
|---|---|
| `/` | `/docs` |
| `/docs` | `/docs` (canonical 200, no redirect) |
| `/docs/getting-started` | `/docs/jovie-essentials/start-here` |
| `/docs/features` | `/docs/build-your-presence` |
| `/docs/plans-pricing` | `/docs/manage-jovie/plans-and-billing` |
| `/docs/api-reference` | `/docs/developers/api-reference` |
| `/docs/self-serve-guide` | `/docs/jovie-essentials` |
| `/docs/self-serve-guide/claim-handle` | `/docs/jovie-essentials/find-or-claim-your-profile` |
| `/docs/self-serve-guide/connect-dsps` | `/docs/jovie-essentials/connect-music-accounts` |
| `/docs/self-serve-guide/set-up-profile` | `/docs/build-your-presence/profile-and-identity/edit-profile` |
| `/docs/self-serve-guide/share-first-link` | `/docs/build-your-presence/releases-and-smart-links/add-release-or-smart-link` |
| `/docs/self-serve-guide/set-up-tipping` | `/docs/build-your-presence/payments-and-support` |
| `/docs/self-serve-guide/set-up-ad-pixels` | `/docs/manage-jovie/integrations` |
| `/docs/self-serve-guide/connect-bandsintown` | `/docs/manage-jovie/integrations` |
| `/docs/features/profile` | `/docs/build-your-presence/profile-and-identity` |
| `/docs/features/profile/tour-dates` | `/docs/manage-jovie/integrations` |
| `/docs/features/profile/verified-badge` | `/docs/build-your-presence/profile-and-identity` |
| `/docs/features/releases` | `/docs/build-your-presence/releases-and-smart-links` |
| `/docs/features/audience` | `/docs/build-your-presence/audience` |
| `/docs/features/audience/crm` | `/docs/build-your-presence/audience` |
| `/docs/features/analytics` | `/docs/build-your-presence/insights-and-analytics` |
| `/docs/features/analytics/ai-insights` | `/docs/build-your-presence/insights-and-analytics` |
| `/docs/features/analytics/ad-pixels` | `/docs/manage-jovie/integrations` |
| `/docs/features/chat-ai` | `/docs/build-your-presence/jovie-assistant` |
| `/docs/features/tips` | `/docs/build-your-presence/payments-and-support` |
| `/docs/features/retargeting-ads` | `/docs/manage-jovie/integrations` |
| `/getting-started` | `/docs/jovie-essentials/start-here` |
| `https://support.jov.ie/*` | `https://jov.ie/support` with the existing query string preserved |

JOV-5896 must generate its redirect fixture from this table and prove a single
redirect at most. The implementation must also update canonical tags,
breadcrumbs, sitemap entries, search records, `llms.txt`, agent-readable
markdown, the developer page, the API contract URL, and in-product links so new
traffic does not depend on redirects.

## Home-card destination map

The card copy is locked in JOV-5895. These are the exact destinations.

| Home card | Destination | Required initial contents |
|---|---|---|
| Start with Jovie | `/docs/jovie-essentials/start-here` | start overview plus the find, claim, connect, edit, publish, and share sequence |
| Profile & identity | `/docs/build-your-presence/profile-and-identity` | edit-profile guide; links to claim and publish without duplicating them |
| Releases & links | `/docs/build-your-presence/releases-and-smart-links` | add-release-or-smart-link guide |
| Audience & insights | `/docs/build-your-presence/audience` | audience-data guide plus a clearly secondary link to `/docs/build-your-presence/insights-and-analytics` |
| Account & billing | `/docs/manage-jovie/account-and-login` | login guide plus links to plans/billing and privacy/data |
| Troubleshooting | `/docs/manage-jovie/troubleshooting` | wrong-artist/catalog guide plus contact-support fallback |

Developer material is intentionally absent from the cards. It remains reachable
from the sidebar, direct URLs, search when the query has developer intent, and
the developer marketing page.

## Initial search-query test set

Search evaluation uses the exact query and expected winning result below.
Developer results may not outrank creator guides unless the query has explicit
API, OpenAPI, endpoint, JSON, CLI, or developer intent.

| Query | Expected winning result |
|---|---|
| `start with jovie` | Start here |
| `find my page` | Find your Jovie profile |
| `find myself` | Find your Jovie profile |
| `claim artist` | Claim your profile |
| `claim my profile` | Claim your profile |
| `already claimed` | Claim your profile |
| `log in` | Create an account or log in |
| `sign in` | Create an account or log in |
| `connect spotify` | Connect your music accounts |
| `connect apple music` | Connect your music accounts |
| `connect youtube` | Connect your music accounts |
| `wrong artist` | Fix the wrong artist or catalog |
| `wrong music` | Fix the wrong artist or catalog |
| `missing release` | Add a release or create its link |
| `edit profile` | Edit your name, bio, images, and links |
| `change photo` | Edit your name, bio, images, and links |
| `publish page` | Publish your profile |
| `share my link` | Share your Jovie link |
| `copy profile url` | Share your Jovie link |
| `add release` | Add a release or create its link |
| `smart link` | Add a release or create its link |
| `analytics` | Understand basic visitor and audience data |
| `who visited` | Understand basic visitor and audience data |
| `where are my fans` | Understand basic visitor and audience data |
| `billing` | Manage your subscription |
| `cancel` | Manage your subscription |
| `invoice` | Manage your subscription |
| `delete account` | Manage privacy and account data |
| `export my data` | Manage privacy and account data |
| `privacy` | Manage privacy and account data |
| `contact support` | Contact support or report incorrect data |
| `wrong data` | Contact support or report incorrect data |
| `api` | API Reference |
| `openapi` | API Reference |
| `profile endpoint json` | API Reference |

## Content that must not be publicly surfaced in V1

The routes may remain as redirects, but their old content must be excluded from
navigation, primary search, sitemap, related guides, and answer snippets.

1. Any old MDX body that has not been rewritten through the JOV-5898 structure
   and human-certified under JOV-5899.
2. Pricing amounts, annual discounts, trials, plan comparison tables, feature
   limits, or AI quotas copied from `/docs/plans-pricing`. The current
   entitlement registry is the only product source and the guide still needs
   human certification.
3. The one-business-day support response promise.
4. The claim that Pro or Max automatically proves identity or adds a verified
   badge without a separate verification state.
5. Instructions for a standalone profile `Public` toggle.
6. Instructions that send music-account setup to Settings > Integrations or
   Settings > Connections. That current settings page is for Gmail and Google
   Calendar.
7. Claims that Spotify, Apple Music, and YouTube share one authorization or
   import workflow.
8. `/dashboard/*` paths, Dashboard > Links, Dashboard > Earnings, Settings > Ad
   Pixels, or other retired route labels.
9. Uncertified tips, Venmo, payout timing, fan-message, ad-pixel, server-side
   event, consent, retargeting, Bandsintown timing, CRM, and release timing
   claims from the old feature pages.
10. `Coming soon` capabilities, internal/default-on flags, admin tools,
    internal developer tools, experiments, dry-run notifications, internal
    TestFlight, or planned monetization. This does not exclude the explicitly
    retained public API and technical documentation under `/docs/developers`.
11. Developer/API documentation in the creator home cards or above creator
    onboarding in search without developer intent.
12. The old edit-repository target
    `https://github.com/ArtistFirst/Jovie/tree/main/apps/docs`. JOV-5894 must use
    `https://github.com/JovieInc/Jovie/tree/main/apps/docs` or remove the edit
    control if public repository editing is not intended.
13. The broken `https://docs.jov.ie/getting-started` link after its redirect has
    served migration traffic; all new source must use the canonical URL.

## Implementation handoff

| Issue | This artifact is authoritative for |
|---|---|
| JOV-5894 | canonical host/prefix, top-level IA labels, developer separation, edit-repository correction |
| JOV-5895 | exact home-card destinations |
| JOV-5896 | every disposition, redirect row, in-product link correction, and single-hop fixture |
| JOV-5898 | which old bodies may be examples only and which claims must be excluded |
| JOV-5899 | the 14 article IDs, missing feature IDs, zero-certification baseline, routes, and search aliases |
| JOV-5901 | find, claim, login, music connection, and wrong-catalog truth gaps |
| JOV-5902 | edit, publish, share, and release/link routes and labels |
| JOV-5903 | audience route correction, billing, privacy controls, support fallback, and unavailable contextual-report state |

## Re-evaluation triggers

**Ship now:** the IA, 14-guide set, six home destinations, developer separation,
and redirect table above.
**Re-evaluate when:** a product route or exact label changes, JOV-5899 creates a
real feature-ID registry, a provider flow becomes unified, a contextual support
form ships, or a guide receives candidate-build certification.
**Then:** update the affected row and its certification evidence in the same
change as the product/guide change. Do not restore a hidden old article by
default.

## Audit evidence

- MDX/page-map source: `apps/docs/app/**/*.mdx`, `apps/docs/app/**/_meta.ts`.
- Docs shell/edit source: `apps/docs/app/layout.tsx`.
- Support source: `apps/web/app/(marketing)/support/*`,
  `apps/web/components/organisms/SupportPageContent.tsx`.
- Current route constants and redirects: `apps/web/constants/routes.ts`,
  `apps/web/next.config.js`, `apps/web/proxy.ts`.
- Exact navigation labels: dashboard nav config, settings sidebar config, user
  button, Library, Contacts/Audience, profile actions, Billing, and Data &
  Privacy source under `apps/web`.
- Product availability: `docs/FEATURE_REGISTRY.md`,
  `apps/web/lib/entitlements/registry.ts`.
- Certification semantics:
  `apps/web/lib/ovie/mcp/artist-profile-inventory.ts`.
- Repository ownership: `.github/CODEOWNERS`.
- GBrain coordination query: keyword search returned no JOV-5893 pages;
  semantic query timed out. Recorded as `gbrain-unavailable` /
  `context-no-results`; mutable product claims were verified from current
  tracked source instead.
