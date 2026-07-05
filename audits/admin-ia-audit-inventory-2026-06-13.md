# Admin IA Audit — Page Inventory & Overlap Analysis

**Linear:** [JOV-2116](https://linear.app/jovie/issue/JOV-2116/admin-ia-audit-inventory-each-pages-distinct-job-and-data-overlaps)  
**Status:** Decision document (audit only — no navigation or route changes in this issue)  
**Authority:** This file is the required decision record before any change to `constants/admin-navigation.ts`, route merges, or admin nav structure.  
**Audited:** 2026-06-13 against `main` @ branch `tim/jov-2116-admin-ia-audit-inventory`

---

## Executive summary

Jovie admin IA is organized into **6 primary workspaces** (sidebar “Workspaces”) and **4 utility tools** (sidebar “Utilities”), plus **8 orphan/hidden routes** that exist in code but are not first-class nav destinations.

The largest overlaps are:

1. **Overview ↔ Ops** — revenue, runway, reliability, and deployment health appear on both surfaces with different density and action affordances.
2. **Overview ↔ Growth** — GTM funnel counts and outreach pipeline metrics are summarized on Overview and operationalized on Growth.
3. **Growth ↔ People** — lead ingest and creator records bridge the two workspaces; several legacy URLs already redirect into them.
4. **Ops ↔ Activity** — both surface “what happened recently,” but Ops is actionable/live-control while Activity is an audit trail.

**No pages should be merged or removed without Tim’s explicit approval on the recommendations below.** This audit does not implement IA changes.

---

## Scope & methodology

| In scope | Out of scope |
| --- | --- |
| All routes under `/app/admin/**` | Creator-facing dashboard/settings (non-admin) |
| Nav registry in `constants/admin-navigation.ts` | `/hud-tv` token wallboard (separate product surface) |
| Legacy redirects in `ADMIN_LEGACY_REDIRECT_MAP` | API-only admin endpoints |
| Orphan pages reachable by direct URL | Visual/regression snapshot coverage |

**Sources reviewed:** route `page.tsx` files, `_components` section loaders, `HudDashboardClient`, `admin-navigation.ts`, `admin-surface-manifest.ts`, `dashboard-nav/config.ts`, and normalization tests (JOV-2525).

**Note on Overview:** Linear issue context referenced a two-tab Overview (scoreboard + workspace hub). That pattern was **removed in JOV-2525** (`admin-overview-shell-normalization.test.ts`). Current Overview is a single scrollable KPI dashboard; workspace navigation lives exclusively in the sidebar.

---

## Navigation authority map

### Registered workspaces (`ADMIN_PRIMARY_WORKSPACE_IDS`)

| Nav ID | Label | Route | Section |
| --- | --- | --- | --- |
| `overview` | Overview | `/app/admin` | Workspaces |
| `ops` | Ops | `/app/admin/ops` | Workspaces |
| `people` | People | `/app/admin/people` | Workspaces |
| `growth` | Growth | `/app/admin/growth` | Workspaces |
| `platform_connections` | Platform Connections | `/app/admin/platform-connections` | Workspaces |
| `activity` | Activity | `/app/admin/activity` | Workspaces |

### Registered utilities (`ADMIN_SETTINGS_TOOL_IDS`)

| Nav ID | Label | Route | Section |
| --- | --- | --- | --- |
| `investors` | Investors | `/app/admin/investors` | Utilities |
| `screenshots` | Screenshots | `/app/admin/screenshots` | Utilities |
| `share_studio` | Share Studio | `/app/admin/share-studio` | Utilities |
| `costs` | Costs | `/app/admin/costs` | Utilities |

### Orphan / hidden routes (not in `ADMIN_NAV_REGISTRY`)

| Route | Behavior today |
| --- | --- |
| `/app/admin/interviews` | Standalone page; no nav link |
| `/app/admin/playlists` | Standalone page; no nav link |
| `/app/admin/agent-runs/[id]` | Debug detail; linked from Ops AgentOS panel |
| `/app/admin/investors/links` | Sub-route of Investors utility |
| `/app/admin/investors/settings` | Sub-route of Investors utility |
| `/app/admin/algorithm-health` | Redirect → `/app/admin/people?view=creators` |
| `/app/admin/growth/yc-metrics` | Redirect → `/app/admin` (Overview) |
| `/app/settings/admin` | Redirect → `/app/admin/ops` |

### Legacy flat routes (redirect into workspace views)

All entries in `ADMIN_LEGACY_REDIRECT_MAP` — e.g. `/app/admin/waitlist` → People/waitlist, `/app/admin/outreach/email` → Growth/outreach+queue=email, `/app/admin/leads` → Growth/leads. **Keep redirects until a nav change is approved.**

---

## Primary inventory

### Overview — `/app/admin`

| Field | Value |
| --- | --- |
| **Primary job** | Executive GTM + revenue scoreboard for daily operator check-in |
| **Route file** | `apps/web/app/app/(shell)/admin/page.tsx` |
| **Data shown** | **Hero:** MRR, paying customers, WoW growth (`getAdminFunnelMetrics`). **Scoreboard:** 7-day funnel (Scraped → Qualified → Contacted → Claimed → Signed Up → Paid), 4-week trend chart, all-time totals. **Core KPIs:** MRR, ARR, runway, default-alive date, paying customers, WoW/MoM growth. **Instagram activation:** step views, bio copies, open rate, activations, activation rate (7d). **YC metrics:** engagement proxy (active profiles 30d) + placeholders (churn, retention, CAC/LTV). **Outreach pipeline card:** outreach sent, claim clicks, signups, paid conversions, $/outreach. **Reliability card:** error rate, p95 latency, Sentry unresolved 24h, billing incidents, Redis, deployment state |
| **Key data sources** | `lib/admin/funnel-metrics.ts`, `lib/admin/reliability.ts`, Stripe + leads + creator distribution tables |
| **Overlapping fields** | MRR, paying customers, runway → **Ops**. Funnel stages (scraped/qualified/contacted/claimed/signup/paid) → **Growth** `GtmFunnel` + `LeadTable`. Outreach queue counts → **Growth** outreach panel. Reliability/deployment → **Ops** HUD. Creator engagement proxy → **People** creators activity. Stripe webhook events also appear on **Activity** |
| **Recommendation** | **Keep as executive summary.** Do not re-add workspace navigation cards (removed JOV-2525). On future IA pass: strip operational reliability/deployment detail to Ops-only deep links; keep high-level health pill with link. Consider moving Instagram/YC placeholder blocks below fold or into a collapsible “Benchmarks” section. |

---

### Ops — `/app/admin/ops`

| Field | Value |
| --- | --- |
| **Primary job** | Live operations command center: health, deploys, AI ops dispatch, blockers, canaries |
| **Route file** | `apps/web/app/app/(shell)/admin/ops/page.tsx` + `HudDashboardClient.tsx` |
| **Data shown** | **Canaries:** public profile, auth signup/onboarding. **Nightly testing agent** status + workflow link. **Operational control panel** (feature flags / controls). **HUD metrics:** MRR + subscriber count, runway (cash, 30d burn), DB operations health, reliability score, default-alive status + narrative, shipping velocity chart (7d PR merges), AgentOS runs panel, deployment history, AI ops queue (running/review/blocked/failed/stale), Tim action items, design proposal review, Hermes dispatch UI. **Kiosk mode:** `?mode=kiosk` full-density TV layout inside admin shell |
| **Key data sources** | `lib/hud/metrics.ts` (Stripe, Mercury, Sentry, GitHub deploys, DB health, AI ops), canary queries, nightly agent report |
| **Overlapping fields** | MRR, subscribers, runway, burn, reliability, default-alive → **Overview**. Deployment state → **Overview** ReliabilityCard + **Activity** (indirect). Shipping velocity is **Ops-only** today. Financial runway also appears in **Costs** (manual vendor spend, different granularity) |
| **Recommendation** | **Keep as the operational source of truth.** Overview should link here for drill-down, not duplicate full HUD. Settings → Admin correctly redirects here (`/app/settings/admin`). No merge with Overview. |

---

### People — `/app/admin/people` (5 views)

| Field | Value |
| --- | --- |
| **Primary job** | CRUD + inspection of human-facing records across the customer lifecycle |
| **Route file** | `apps/web/app/app/(shell)/admin/people/page.tsx` |
| **Views** | `waitlist`, `creators`, `users`, `releases`, `feedback` (query param `view`) |
| **Data shown** | **Waitlist:** integrity summary, funnel metrics (`WaitlistMetrics`), paginated waitlist table with approve/disapprove. **Creators:** searchable/sortable creator profiles, verify/feature/marketing toggles, bulk actions, sidebar detail. **Users:** searchable users, ban/verify/marketing/feature toggles. **Releases:** discog releases table, search/sort. **Feedback:** product feedback items with status, source, user context |
| **Key data sources** | `lib/admin/waitlist.ts`, `lib/admin/creator-profiles.ts`, `lib/admin/users.ts`, `lib/admin/releases.ts`, `lib/feedback.ts` |
| **Overlapping fields** | Waitlist counts ↔ **Overview** funnel (indirect). Creator profiles created ↔ **Activity** feed. Lead → creator conversion ↔ **Growth** ingest. User emails/handles ↔ **Growth** `LeadTable` contact fields. Interviews (orphan) ↔ **feedback** + **users** identity fields |
| **Recommendation** | **Keep unified People workspace** — distinct job (record management) vs Growth (pipeline automation). Do not split back into flat legacy routes. Consider surfacing **Interviews** as a 6th People tab rather than orphan route. `algorithm-health` redirect to creators is correct; retire route file after redirect telemetry is zero. |

---

### Growth — `/app/admin/growth`

| Field | Value |
| --- | --- |
| **Primary job** | Self-driving artist discovery → qualification → outreach → ingest pipeline |
| **Route file** | `apps/web/app/app/(shell)/admin/growth/page.tsx` |
| **Sub-surfaces** | Always-visible: `GtmFunnel` + `LeadTable`. Accordions (`GtmCollapsibles`): Intake & Keywords (`?view=ingest`), Advanced Settings, Outreach & Campaigns (`?view=outreach` or `?view=campaigns`). Legacy URLs map outreach queues (`email`, `dm`, `review`) via `ADMIN_LEGACY_REDIRECT_MAP` |
| **Data shown** | **Funnel:** discovered → qualified → approved → ingested → contacted → claimed → signed up → paid (counts + conversion rates). **Lead table:** handle, display name, email, status, Linktree URL, actions. **Intake:** single/queue ingest composer, keyword manager. **Pipeline controls:** automation switches. **Outreach:** queue overview (all/email/dm/review), campaign manager |
| **Key data sources** | `lib/leads/reporting.ts`, leads schema, outreach tables, ingest APIs |
| **Overlapping fields** | Full funnel counts ↔ **Overview** 7-day funnel + outreach card (subset/time-windowed). Outreach sent/claimed/signup/paid ↔ **Overview** scoreboard. Ingested leads → **People** creators. Campaign invite flows ↔ **People** waitlist (indirect). YC metrics placeholders on **Overview** were formerly a separate route (`/growth/yc-metrics` now redirects to Overview) |
| **Recommendation** | **Keep as distinct workspace** — confirmed in issue context. IA improvement candidate: promote accordion sections to real `view` tabs (leads / outreach / campaigns / ingest) matching `adminGrowthViews` constants and legacy redirect map, so URL, nav state, and UI align. Do not fold into Overview. |

---

### Platform Connections — `/app/admin/platform-connections`

| Field | Value |
| --- | --- |
| **Primary job** | Internal Spotify publisher OAuth + automated playlist engine configuration |
| **Route file** | `apps/web/app/app/(shell)/admin/platform-connections/page.tsx` |
| **Tabs** | `spotify` (publisher connection health, scopes), `engine` (generation interval, last/next run) |
| **Data shown** | Spotify account label, approved/missing scopes, connection health, engine enabled flag, interval, timestamps, current admin user Spotify status |
| **Key data sources** | `platform-connections-data.ts`, Clerk OAuth, admin settings schema |
| **Overlapping fields** | Playlist **approval queue** (`/app/admin/playlists` orphan) is downstream of engine — same domain, different job (config vs moderation). Share payloads for playlists ↔ **Share Studio** |
| **Recommendation** | **Keep standalone** — infra/integration config should not live under Growth or Ops. Link orphan **Playlists** page from Engine tab (“Review pending playlists”) instead of leaving it unreachable from nav. |

---

### Activity — `/app/admin/activity`

| Field | Value |
| --- | --- |
| **Primary job** | Cross-cutting chronological audit trail of notable platform events |
| **Route file** | `apps/web/app/app/(shell)/admin/activity/page.tsx` |
| **Data shown** | Unified activity table (50 items): recent creator profile creations, Stripe webhook events (typed), timestamps, user handles, status |
| **Key data sources** | `getAdminActivityFeed()` in `lib/admin/overview.ts` |
| **Overlapping fields** | Creator creation events ↔ **People** creators list. Stripe events ↔ **Overview** reliability/billing incidents. Deployments/AI ops runs ↔ **Ops** (not in Activity feed today). `AdminActivitySection` component exists but is **not mounted** on Overview — dead code candidate |
| **Recommendation** | **Keep separate from Ops** — Activity is read-only history; Ops is live control. Expand feed sources (deploys, outreach sends, admin actions) rather than merging pages. Remove or wire `AdminActivitySection` — avoid a third partial activity surface on Overview. |

---

### Investors — `/app/admin/investors` (+ links, settings)

| Field | Value |
| --- | --- |
| **Primary job** | Fundraising pipeline: tracked investor links, engagement scoring, stage management |
| **Route files** | `investors/page.tsx`, `investors/links/page.tsx`, `investors/settings/page.tsx` |
| **Data shown** | **Pipeline table:** label, investor name, stage, engagement score, view count, last viewed, active flag, token. **Links:** create/manage tracked URLs. **Settings:** fundraising configuration form |
| **Key data sources** | `investors-data.ts`, investor links API routes |
| **Overlapping fields** | Minimal overlap — view counts/scores are fundraising-specific. Share link patterns ↔ **Share Studio** (different audience: investors vs public marketing) |
| **Recommendation** | **Keep in Utilities** — correct separation from GTM Growth. Sub-routes (links, settings) are appropriately nested; no merge needed. |

---

### Screenshots — `/app/admin/screenshots`

| Field | Value |
| --- | --- |
| **Primary job** | QA catalog browser for canonical + supporting visual captures |
| **Route file** | `apps/web/app/app/(shell)/admin/screenshots/page.tsx` |
| **Data shown** | Gallery of screenshot artifacts, canonical surface IDs, capture metadata, download/preview |
| **Key data sources** | `lib/admin/screenshots.ts`, `CANONICAL_SURFACES` registry |
| **Overlapping fields** | Canonical surface list ↔ **admin e2e visual regression** manifest. Marketing assets ↔ **Share Studio** (screenshots are observational; Share Studio is generative) |
| **Recommendation** | **Keep utility** — distinct job from Share Studio. Optional: cross-link from Screenshots to Share Studio for the same surface slug. |

---

### Share Studio — `/app/admin/share-studio`

| Field | Value |
| --- | --- |
| **Primary job** | Preview and export public share payloads (blog, profile, release, playlist) with UTM-tracked links |
| **Route file** | `apps/web/app/app/(shell)/admin/share-studio/page.tsx` |
| **Data shown** | Sample pickers per content type, story asset preview, prepared text, X/Threads/email/mailto payloads, tracked link variants |
| **Key data sources** | `loader.ts` (real content samples from DB) |
| **Overlapping fields** | Public profile/release/playlist records ↔ **People** releases & creators. Visual QA ↔ **Screenshots**. Investor tracked links ↔ **Investors** (different UTM schema/purpose) |
| **Recommendation** | **Keep utility** — clear distinct job (payload engineering). Not a workspace. |

---

### Costs — `/app/admin/costs`

| Field | Value |
| --- | --- |
| **Primary job** | Manual 30-day vendor spend ledger (lagging, v1) |
| **Route file** | `apps/web/app/app/(shell)/admin/costs/page.tsx` |
| **Data shown** | Line items: label, monthly estimate, observed 30d USD, period, notes, external dashboard links; last refreshed timestamp |
| **Key data sources** | `admin_costs` table, `lib/admin/costs.ts` seed defaults (Vercel AI Gateway, Neon, Anthropic, OpenAI, etc.) |
| **Overlapping fields** | **Ops** runway burn (Mercury 30d) vs **Costs** manual line items — same financial domain, different fidelity. MRR on **Overview/Ops** is revenue-side, not cost |
| **Recommendation** | **Keep utility** until automated cost ingestion exists. Add explicit “Ops runway uses Mercury; this page is manual vendor ledger” helper text. Do not merge into Ops HUD without auto-sync story. |

---

## Orphan route inventory

| Page | Primary job | Data shown | Overlaps | Recommendation |
| --- | --- | --- | --- | --- |
| **Interviews** `/app/admin/interviews` | Mom Test interview review after onboarding | Transcript Q&A, summarization status, user handle/email | **People** users, **feedback** | Add as People tab `interviews` OR link from People → users row actions. Do not delete — unique qualitative data |
| **Playlists** `/app/admin/playlists` | Approve/reject auto-generated playlists | Pending/published/rejected playlists, track count, Spotify link | **Platform Connections** engine | Link from Platform Connections Engine tab; consider Growth-adjacent utility or Platform Connections sub-tab |
| **Agent run detail** `/app/admin/agent-runs/[id]` | AI connector prompt/debug loop | Prompt, model output, tool calls, token cost | **Ops** AgentOS panel | Keep as detail route — no nav entry needed |
| **Algorithm health** (redirect) | Legacy | n/a | **People** creators | Remove route after 90d zero traffic; redirect is sufficient |
| **YC metrics** (redirect) | Legacy | n/a | **Overview** YC section | Remove route; content already on Overview |
| **Settings admin** (redirect) | Legacy entry | n/a | **Ops** | Keep redirect permanently |

---

## Cross-cutting overlap matrix

| Data domain | Overview | Ops | Growth | People | Activity | Utilities |
| --- | --- | --- | --- | --- | --- | --- |
| MRR / subscribers | Hero + KPI | HUD card | — | — | — | — |
| Runway / burn | KPI (Stripe-derived) | HUD (Mercury) | — | — | — | Costs (manual) |
| Reliability / Sentry | ReliabilityCard | HUD card | — | — | — | — |
| Deployments | ReliabilityCard state | Full panel + velocity | — | — | — | — |
| GTM funnel counts | 7d scoreboard | — | GtmFunnel (all stages) | — | — | — |
| Outreach pipeline | OutreachPipelineCard | — | Outreach panel | — | — | — |
| Lead records | — | — | LeadTable | Creators (post-ingest) | — | — |
| Creator profiles | Engagement proxy | — | Ingest output | Creators tab | Feed events | Share Studio samples |
| Waitlist | Funnel (indirect) | — | Campaigns (indirect) | Waitlist tab | — | — |
| Stripe events | Incidents | — | Paid stage | — | Feed | — |
| Fundraising | — | — | — | — | — | Investors |
| Visual QA | — | — | — | — | — | Screenshots |
| Share payloads | — | — | — | Releases | — | Share Studio |

**Highest-risk duplication (operator confusion):**

1. MRR appears 3× on Overview (hero, KPI, implicit in runway).
2. Funnel story told on Overview (7d) and Growth (all-stage) with different time windows.
3. Reliability/deployment health on Overview sidebar card and Ops HUD.
4. Activity feed component exists but is orphaned from Overview while Activity page is thin.

---

## Decision options for Tim (pick before implementation)

| # | Decision | Options | Audit recommendation |
| --- | --- | --- | --- |
| D1 | Overview vs Ops revenue/health | A) Keep overlap B) Overview = summary + deep links C) Merge | **B** — Overview shows single-line health; Ops owns drill-down |
| D2 | Growth sub-nav | A) Keep accordions B) Promote to `view` tabs | **B** — aligns with `adminGrowthViews` + legacy redirects |
| D3 | Orphan Interviews | A) Delete B) People tab C) Stay orphan | **B** — same “people insights” mental model |
| D4 | Orphan Playlists | A) Delete B) Platform Connections sub-tab C) Stay orphan | **B** — tight coupling to playlist engine |
| D5 | Activity feed expansion | A) Keep minimal B) Add deploy/outreach/admin events C) Merge into Ops | **B** — preserve read-only audit trail |
| D6 | Utilities in sidebar | A) Keep Utilities section B) Move to Overview hub cards C) Settings submenu | **A** — utilities are infrequent; current split is fine |
| D7 | `AdminActivitySection` dead code | A) Wire to Overview B) Delete C) Leave | **B or wire to Activity only** — avoid third surface |

---

## Acceptance criteria checklist (JOV-2116)

- [x] Table of Page → primary job → data shown → overlapping fields → recommendation
- [x] Covers all registered nav destinations + material orphan routes
- [x] Explicitly flags `admin-navigation.ts` as change authority
- [x] No navigation file modifications in this deliverable
- [ ] **Tim review / approval** — required before any structural IA PR

---

## Suggested follow-up issues (post-approval only)

1. **IA-1:** Growth `view` tabs — align URL, tests, and `admin-surface-manifest.ts` with `adminGrowthViews`.
2. **IA-2:** Overview slim-down — reliability/deployment summary + links to Ops.
3. **IA-3:** People `interviews` tab — migrate `/app/admin/interviews`.
4. **IA-4:** Platform Connections ↔ Playlists link — surface orphan playlist approval.
5. **IA-5:** Activity feed enrichment + remove dead `AdminActivitySection`.
6. **IA-6:** Retire zero-traffic legacy redirects (`algorithm-health`, `yc-metrics`).

---

*Generated for JOV-2116. Implementation PRs must cite Tim’s decisions (D1–D7) and treat this file as the IA authority.*