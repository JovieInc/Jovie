# Ovie IA consolidation — route inventory (JOV-6895)

Every `/app/ov/*` surface classified KEEP / MERGE / MOVE / DELETE. Goal: the
Ovie nav is small, legible, and job-oriented — no page exists solely because
an internal subsystem exists. Redirects land in `apps/web/next.config.js`
(non-permanent); the page-level redirect-stub guard
(`tests/unit/routes/shell-nav-coverage.test.ts`) blocks new stubs, so
consolidated routes are config redirects, not stub pages.

## Primary workspaces (KEPT — each owns a recurring founder job)

| Route | Nav label | Founder job |
|---|---|---|
| `/hud` | Now | Company pulse: health, ranked signals, freshness |
| `/app/ov/growth` | Growth | Acquisition pipeline: leads, outreach, campaigns, ingest |
| `/app/ov/product` | Product | What is certified, deployed, exposed, observed |
| `/app/ov/operations` | Operations | Autonomous execution outcomes, exceptions, queues |
| `/app/ov/needs-you` | Needs You | Founder judgments automation cannot make |

Customer-lifecycle data that Growth used to duplicate lives in the canonical
Customer CRM (`/app/ov/people?view=contacts`); Growth keeps only acquisition
views. Headline revenue metrics formerly isolated in Revenue Lift are the
Business tile on the Now health dashboard.

## Utilities (KEPT)

| Route | Nav label | Founder job |
|---|---|---|
| `/app/ov/chat` | Chat | Operator chat surface |
| `/app/ov/certifications` | Certifications | Founder certify/reject of certification evidence — also the canonical home for design/taste review objects and certification-driven rollout (replaces manual feature toggles) |
| `/app/ov/shipping` | Shipping | What's New/changelog: merge velocity, deploy and runtime receipts |
| `/app/ov/people` | People | Canonical Customer CRM: contacts, waitlist, creators, users, releases, assets, feedback |
| `/app/ov/activity` | Timeline | Semantic company changes and measured outcomes |
| `/app/ov/investors` | Investors | Fundraising pipeline on the canonical table system with real entity rows |
| `/app/ov/feature-registry` | Feature Registry | Review packets for canonical product capabilities |
| `/app/ov/costs` | Costs | Infra, AI gateway, and vendor spend |

## Consolidated routes

| Route | Class | Destination | Rationale |
|---|---|---|---|
| `/app/ov/share-studio` | DELETE | → `/app/ov/growth` | Empty/unclear; no recurring founder job defined |
| `/app/ov/revenue-lift` | MERGE | → `/hud` | Dense, unexplainable KPI tree; headline metric folded into Now's Business tile |
| `/app/ov/platform-connections` | MOVE | → `/app/settings/connectors` | Canonical Integrations surface; Playlist Engine/Publisher controls move to Eve/agent workflows |
| `/app/ov/playlists` | MOVE | → `/app/settings/connectors` | Orphan approval queue downstream of the playlist engine; approval becomes an agent workflow |
| `/app/ov/system` | DELETE | → `/hud` | Internal machinery map, not a founder job |
| `/app/ov/features` | MERGE | → `/app/ov/certifications` | Manual flag toggling replaced by certification-driven rollout; flags API remains for backend |
| `/app/feature-flags` | MERGE | → `/app/ov/certifications` | Legacy stub retargeted |

## Hidden machinery (not in nav, unchanged)

`/app/ov/agent-runs/[id]`, `/app/ov/ops`, `/app/ov/algorithm-health`,
`/app/ov/interviews`, `/app/ov/presence`, `/app/ov/screenshots` — internal or
redirect-only routes reachable by direct link for debugging/QA; none are
nav destinations.

## Deferred (documented, not in this diff)

- Investors table density: the page already renders the canonical
  `AdminTableShell`/InvestorTable primitives with real rows from
  `loadAdminInvestorPipelineData`; deeper presentation work is tracked
  separately.
- What Shipped feed inside `/hud` keeps its name; the changelog job is owned
  by Shipping at the nav level.
