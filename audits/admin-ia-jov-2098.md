# Admin IA Consolidation — JOV-2098

**Linear:** [JOV-2098](https://linear.app/jovie/issue/JOV-2098/designadmin-consolidate-overlapping-ia-across-overview-ops-growth)  
**Authority inventory:** [admin-ia-audit-inventory-2026-06-13.md](./admin-ia-audit-inventory-2026-06-13.md) (JOV-2116)  
**Implemented:** 2026-07-31 on `grok/JOV-2098-fix`

## Decision basis

From JOV-2116 audit **D1-B**: Overview = summary health + deep links; detail screens own full metrics and controls. No screens removed; legacy redirects retained.

## Current → proposed ownership

| Concern | Before (overlap) | After (single owner) |
| --- | --- | --- |
| Executive health signals | Overview mounted full funnel, KPI strip, founder HUD, outreach card, reliability card | **Overview** — one tile per area linking out |
| MRR / business headline | Overview hero + KPI + Ops HUD | **Overview** tile → **Revenue Lift** detail |
| Acquisition funnel / conversion | Overview scoreboard + Growth GtmFunnel | **Growth** only |
| Outreach pipeline controls | Overview OutreachPipelineCard + Growth outreach | **Growth** only |
| Reliability / canaries / control panel | Overview ReliabilityCard + Ops | **Ops** only |
| Live HUD / deploys / AI ops | Ops | **Ops** only |
| Waitlist / users / creators / roles | People (+ waitlist metrics on People) | **People** only |
| User stats on Growth | Growth lead table identity fields only | Unchanged (pipeline rows, not People CRUD) |

## Screen contracts

| Screen | Title | Purpose | Must not include |
| --- | --- | --- | --- |
| **Overview** | Overview | Health dashboard — one number per key area, each linking to the detailed screen | Full funnel charts, outreach controls, reliability tables, people tables |
| **Ops** | Ops | Live operational state + controls (canaries, control panel, HUD, incidents) | Growth funnel stages, people CRUD |
| **Growth** | Growth | Acquisition funnel, referral, outreach, conversion | Overview-style multi-area scoreboard; people role management |
| **People** | People | User table, role management, waitlist, creators, individual user actions | Acquisition funnel charts; ops canaries |

## Navigation labels / descriptions (source: `constants/admin-navigation.ts`)

| ID | Label | Description |
| --- | --- | --- |
| overview | Overview | Health dashboard — one signal per area linking to detail screens |
| ops | Ops | Live operational state, canaries, control panel, and incidents |
| growth | Growth | Acquisition funnel, referral, outreach, and conversion |
| people | People | User table, roles, waitlist, creators, and individual actions |

## Routing

- All four primary workspaces remain registered; no screen removal.
- Legacy flat routes continue via `ADMIN_LEGACY_REDIRECT_MAP`.
- Overview health tiles:

  | Area | Signal | Link |
  | --- | --- | --- |
  | Business | MRR | `/app/ov/revenue-lift` |
  | Growth | Weekly Signups | `/app/ov/growth` |
  | Ops | Reliability status | `/app/ov/ops` |
  | People | Waitlisted count | `/app/ov/people?view=waitlist` |

## Acceptance checklist

- [x] IA mapping document (this file)
- [x] No full metric/control panel duplicated on Overview and a detail screen
- [x] Nav labels + screen titles/descriptions match new IA
- [x] No screens removed without replacement routing
