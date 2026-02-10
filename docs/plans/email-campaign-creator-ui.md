# Email Campaign Creator UI — Implementation Plan

> **Status:** Planning
> **Issue:** #9 — Email/campaign system has no creator UI (admin-only)
> **Branch:** `claude/email-campaign-creator-ui-Id65o`

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Design Philosophy](#2-design-philosophy)
3. [Information Architecture](#3-information-architecture)
4. [Screen-by-Screen Specification](#4-screen-by-screen-specification)
5. [Component Architecture](#5-component-architecture)
6. [Database Schema Changes](#6-database-schema-changes)
7. [API Layer](#7-api-layer)
8. [State Management](#8-state-management)
9. [Implementation Phases](#9-implementation-phases)
10. [File Structure](#10-file-structure)
11. [Technical Constraints](#11-technical-constraints)

---

## 1. Problem Statement

### Current State

The email/campaign system is **fully backend-capable** but **admin-locked**:

- **DB schema exists:** `campaignSequences`, `campaignEnrollments`, `emailEngagement`, `emailSuppressions`, `creatorClaimInvites`
- **Backend infra exists:** Resend email provider, HMAC-signed tracking (opens/clicks), drip campaign processor (15-min cron), job queue with retry/throttle, suppression management
- **Admin UI exists:** `InviteCampaignManager.tsx` — a single-page bulk invite tool with fit-score targeting, throttling sliders, and stats dashboard
- **What's missing:** Zero creator-facing UI. Creators (the primary users of Jovie) cannot create, manage, or analyze their own email campaigns. The entire email system is a one-way admin tool for claim invites only.

### Target State

A world-class, creator-facing campaign management system that lets Jovie users:

1. **Create** email campaigns with a visual editor
2. **Target** audiences using segments and filters
3. **Schedule** sends with timezone-aware delivery
4. **Automate** drip sequences with visual flow builders
5. **Analyze** performance with real-time engagement dashboards
6. **Manage** templates as reusable building blocks

---

## 2. Design Philosophy

### Inspired by Linear — Applied to Email

Linear's design principles translate directly to campaign management:

| Linear Principle | Campaign Application |
|---|---|
| **Inverted-L chrome** | Persistent sidebar + top toolbar; content fills remaining space |
| **LCH color with 3 inputs** | Already adopted in Jovie's OKLCH design system (`--theme-base-hue`, `--theme-accent-hue`, `--theme-contrast`) |
| **Sequential progression** | Campaign lifecycle: Draft → Review → Scheduled → Sending → Sent → Analyzed |
| **Keyboard-first** | `Cmd+K` command palette for campaign actions, `E` to edit, `D` to duplicate, `⌫` to archive |
| **Dense but scannable** | Campaign list shows status, subject, audience size, open rate, and send date in a single row without horizontal scroll |
| **Minimal color** | Monochrome interface; color only for status badges (draft=gray, scheduled=blue, sending=amber, sent=green, failed=red) |
| **Content-first layout** | No decorative elements; every pixel serves the workflow |
| **8px spacing scale** | Consistent with Jovie's existing `linear-1` through `linear-8` tokens |

### UX Principles

1. **Progressive disclosure** — Show simple defaults; reveal power features on demand
2. **Inline editing** — Click-to-edit subject lines, sender names, and labels directly in list view
3. **Real-time feedback** — Live character counts, spam score indicators, preview rendering
4. **Non-destructive** — Every action is undoable; deleted campaigns go to archive first
5. **Mobile-aware creation** — Responsive editor that works on tablet; phone shows read-only preview
6. **Zero-state guidance** — Empty states with clear CTAs and contextual onboarding

---

## 3. Information Architecture

### Navigation Structure

```
/app/campaigns                    ← Campaign list (default view)
/app/campaigns/new                ← New campaign wizard
/app/campaigns/[id]               ← Campaign detail / editor
/app/campaigns/[id]/preview       ← Full-screen email preview
/app/campaigns/[id]/analytics     ← Campaign performance analytics
/app/campaigns/templates          ← Template library
/app/campaigns/templates/[id]     ← Template editor
/app/campaigns/automations        ← Automation flows (drip campaigns)
/app/campaigns/automations/[id]   ← Automation flow editor
/app/campaigns/audiences          ← Audience segments
/app/campaigns/audiences/[id]     ← Segment detail / editor
```

### Sidebar Integration

Add to the existing app sidebar (between "Audience" and "Analytics"):

```
📊 Dashboard
👤 Profile
🔗 Links
🎵 Releases
📅 Tour Dates
👥 Audience
✉️  Campaigns        ← NEW (with sub-navigation)
📈 Analytics
💬 Chat
```

The Campaigns section in the sidebar expands to show:
- **All Campaigns** — Main list view
- **Templates** — Reusable email templates
- **Automations** — Drip/triggered sequences
- **Audiences** — Segments & lists

---

## 4. Screen-by-Screen Specification

### 4.1 Campaign List View (`/app/campaigns`)

**Layout:** Full-width table with toolbar, inspired by Linear's issue list.

```
┌─────────────────────────────────────────────────────────────┐
│  Campaigns                                    [+ New Campaign]│
│─────────────────────────────────────────────────────────────│
│  [All] [Drafts] [Scheduled] [Sent] [Automations]           │
│  🔍 Search campaigns...            [Filter ▾] [Sort ▾]     │
│─────────────────────────────────────────────────────────────│
│  ○  Welcome Series            Draft    124 recipients   —   │
│  ○  New Release: Album Drop   Scheduled  1.2K  Mar 15 2pm  │
│  ●  February Newsletter       Sent       3.4K  42.1% open  │
│  ●  Holiday Special           Sent       2.8K  38.7% open  │
│  ○  Re-engagement Flow        Auto/Active  890 enrolled    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Showing 5 of 23 campaigns          [← 1 2 3 4 5 →]       │
└─────────────────────────────────────────────────────────────┘
```

**Key interactions:**
- **Tab bar** at top filters by status (Linear-style segment control)
- **Search** filters by subject line, name, or tag — debounced, instant results
- **Sort** by: Date created, Date sent, Open rate, Click rate, Audience size
- **Filter** by: Status, Date range, Tag, Audience segment
- **Bulk actions** on selection: Archive, Duplicate, Tag, Delete
- **Row click** opens campaign detail in a split-view panel (Linear-style) or navigates to full editor
- **Context menu** (right-click): Edit, Duplicate, Preview, Analytics, Archive, Delete
- **Inline status** badges with color coding:
  - `Draft` — gray, subtle
  - `Scheduled` — blue, with countdown tooltip
  - `Sending` — amber, with progress indicator
  - `Sent` — green, shows open rate
  - `Failed` — red, shows error count
  - `Archived` — muted, strikethrough

**Empty state:**
> "No campaigns yet. Create your first campaign to start reaching your audience."
> [+ Create Campaign] button, centered, with a subtle illustration

### 4.2 Campaign Creator/Editor (`/app/campaigns/[id]`)

**Layout:** Three-column editor with collapsible panels.

```
┌────────┬───────────────────────────────────┬──────────┐
│ Steps  │         Email Content              │ Preview  │
│        │                                    │          │
│ ① Setup│  From: yourname@jov.ie            │ ┌──────┐ │
│ ② Content  Subject: [Your subject here]    │ │      │ │
│ ③ Audience  Preview: [Preview text...]     │ │ Live │ │
│ ④ Review│                                   │ │ Email│ │
│ ⑤ Send │  ┌─────────────────────────┐      │ │Render│ │
│        │  │                         │      │ │      │ │
│        │  │    Block-based Editor    │      │ │      │ │
│        │  │                         │      │ │      │ │
│        │  │  [+ Add Block]          │      │ │      │ │
│        │  │                         │      │ │      │ │
│        │  └─────────────────────────┘      │ └──────┘ │
│        │                                    │ 📱 💻    │
└────────┴───────────────────────────────────┴──────────┘
```

**Left panel — Steps (wizard navigation):**

Vertical step indicator (Linear-style, not a traditional wizard). Each step is always accessible — no forced linear progression. Completed steps show a checkmark. Current step is highlighted. Steps with errors show a warning badge.

1. **Setup** — Campaign name (internal), From name, Reply-to
2. **Content** — Subject line, preview text, email body (block editor)
3. **Audience** — Select recipients (segment, list, or all subscribers)
4. **Review** — Summary of all settings with validation checks
5. **Send** — Schedule or send immediately

**Center panel — Editor:**

Block-based email editor (not drag-and-drop WYSIWYG — too complex for v1). Instead, a structured block editor inspired by Notion/Linear's editor pattern:

**Available blocks:**
| Block | Description |
|---|---|
| **Header** | H1/H2/H3 with brand font |
| **Text** | Rich text with bold, italic, links |
| **Image** | Upload or URL, with alt text |
| **Button** | CTA with customizable text, URL, color |
| **Divider** | Horizontal rule |
| **Spacer** | Adjustable vertical space |
| **Social Links** | Auto-populated from creator's profile |
| **Music Links** | DSP links for a specific release |
| **Columns** | 2-column layout for side-by-side content |
| **Quote** | Styled blockquote |
| **Unsubscribe** | Auto-inserted footer with unsubscribe link (required) |

**Block interactions:**
- Click `+` between blocks to insert
- Drag handle on left of each block to reorder
- Hover reveals edit/duplicate/delete actions
- Blocks have inline settings (alignment, padding, background color)

**Right panel — Live Preview:**

Real-time rendered preview of the email as it will appear in an inbox:
- Toggle between desktop (600px) and mobile (375px) widths
- Shows actual rendered HTML with brand styles
- Updates live as content changes (debounced 300ms)
- "Send test email" button sends to creator's own email

### 4.3 Audience Selector (`/app/campaigns/[id]` — Step 3)

```
┌─────────────────────────────────────────────────────────┐
│  Select Audience                                         │
│─────────────────────────────────────────────────────────│
│                                                          │
│  [● All Subscribers (3,421)]                             │
│  [○ Specific Segment]                                    │
│  [○ Manual Selection]                                    │
│                                                          │
│  ─── Segment Builder ────────────────────────────────── │
│                                                          │
│  Recipients who match [ALL ▾] of these conditions:       │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ [Subscription Date ▾] [is after ▾] [2025-01-01]  ✕ ││
│  │ [Country ▾]           [is ▾]       [United States]✕ ││
│  │ [Engagement ▾]        [is ▾]       [Active]       ✕ ││
│  │                                                      ││
│  │ [+ Add condition]                                    ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  Estimated recipients: 1,247                             │
│  [Save as Segment]                                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Segment conditions (available filters):**

| Category | Conditions |
|---|---|
| **Profile** | Country, City, Device type, Subscription date |
| **Engagement** | Engagement level (active/passive/dormant), Last seen, Visit count |
| **Activity** | Opened previous campaign, Clicked previous campaign, Never opened |
| **Music** | Spotify connected, DSP preference, Purchase count |
| **Tags** | Has tag, Does not have tag |
| **Custom** | Subscribed via (source), Intent level |

**Key interactions:**
- Real-time recipient count updates as conditions change
- "Save as Segment" persists the condition set for reuse
- "Preview recipients" shows a sample of matching audience members
- Supports AND/OR logic between condition groups

### 4.4 Campaign Review & Send (`/app/campaigns/[id]` — Steps 4–5)

```
┌─────────────────────────────────────────────────────────┐
│  Review Campaign                                         │
│─────────────────────────────────────────────────────────│
│                                                          │
│  ✅ Setup                                                │
│     From: Your Name <you@jov.ie>                         │
│     Reply-to: you@gmail.com                              │
│                                                          │
│  ✅ Content                                              │
│     Subject: "New Release: Album Drop 🎵"               │
│     Preview: "Listen now on all platforms"                │
│     Blocks: 6 content blocks                             │
│     [Preview Email →]                                    │
│                                                          │
│  ✅ Audience                                             │
│     Segment: "US Active Subscribers"                     │
│     Recipients: 1,247                                    │
│     Estimated delivery: ~4 minutes                       │
│                                                          │
│  ⚠️ Warnings                                             │
│     • Subject line is 62 chars (recommended: <50)        │
│     • No preview text set (will use first line of body)  │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  [Schedule for Later]              [Send Now]            │
│                                                          │
│  Schedule:                                               │
│  📅 [March 15, 2026]  🕐 [2:00 PM]  🌍 [EST ▾]        │
│  ☑ Smart Send (optimize per recipient timezone)          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Validation checklist (auto-computed):**
- ✅ Subject line is set
- ✅ Email has content (at least one block)
- ✅ Audience is selected (> 0 recipients)
- ✅ Unsubscribe link is present
- ✅ From address is verified
- ⚠️ Subject line length warning
- ⚠️ Missing preview text warning
- ❌ No recipients match segment (blocker)

**Send options:**
- **Send Now** — Confirmation modal with recipient count
- **Schedule** — Date/time picker with timezone selector
- **Smart Send** — Optimal delivery time per recipient (future enhancement)

### 4.5 Campaign Analytics (`/app/campaigns/[id]/analytics`)

```
┌─────────────────────────────────────────────────────────┐
│  ← February Newsletter                    Sent Mar 1    │
│─────────────────────────────────────────────────────────│
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Delivered │ │  Opened  │ │ Clicked  │ │  Unsub   │  │
│  │  3,421   │ │  1,440   │ │   312    │ │    8     │  │
│  │  100%    │ │  42.1%   │ │  9.1%    │ │  0.2%   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                          │
│  ─── Engagement Over Time ──────────────────────────── │
│  ┌─────────────────────────────────────────────────┐   │
│  │          Opens & Clicks (48h after send)         │   │
│  │   ╭─╮                                           │   │
│  │  ╭╯ ╰╮                                          │   │
│  │ ╭╯   ╰──╮                                       │   │
│  │╭╯       ╰─────────────────────────────────      │   │
│  │ 0h   6h   12h   24h   36h   48h                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ─── Click Map ─────────────────────────────────────── │
│  Link                              Clicks    Rate      │
│  "Listen on Spotify"                 187     59.9%     │
│  "Apple Music"                        68     21.8%     │
│  "Tour Dates"                         42     13.5%     │
│  "Merch Store"                        15      4.8%     │
│                                                          │
│  ─── Recipient Activity ────────────────────────────── │
│  [Opened ▾] [All ▾]                   🔍 Search        │
│  @username1   Opened 2h after send    Clicked 2 links  │
│  @username2   Opened 5h after send    No clicks        │
│  @username3   Opened 12h after send   Clicked 1 link   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Key metrics cards:**
- **Delivered** — Total sent minus bounces
- **Opened** — Unique opens / delivered (with trend vs. previous campaign)
- **Clicked** — Unique clicks / delivered (with click-to-open rate)
- **Unsubscribed** — Unsubscribes from this campaign
- **Bounced** — Hard + soft bounces

**Charts (using existing recharts dependency):**
- **Engagement over time** — Area chart showing cumulative opens and clicks over 48h
- **Click map** — Table of links with click counts and percentages
- **Device breakdown** — Pie chart (desktop vs. mobile vs. tablet)
- **Geographic heatmap** — Top countries/regions (future enhancement)

**Recipient activity table:**
- Filterable by: Opened, Clicked, Bounced, Unsubscribed
- Searchable by name/email
- Click to view recipient profile in audience sidebar

### 4.6 Template Library (`/app/campaigns/templates`)

```
┌─────────────────────────────────────────────────────────┐
│  Templates                              [+ New Template] │
│─────────────────────────────────────────────────────────│
│  [My Templates] [Starter Templates]                      │
│─────────────────────────────────────────────────────────│
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │            │  │            │  │            │        │
│  │  Welcome   │  │  New       │  │  Monthly   │        │
│  │  Email     │  │  Release   │  │  Update    │        │
│  │            │  │            │  │            │        │
│  │            │  │            │  │            │        │
│  ├────────────┤  ├────────────┤  ├────────────┤        │
│  │ Welcome    │  │ Release    │  │ Newsletter │        │
│  │ Used 12x   │  │ Used 8x    │  │ Used 4x    │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  ┌────────────┐  ┌────────────┐                         │
│  │            │  │    + + +   │                         │
│  │  Tour      │  │            │                         │
│  │  Announce  │  │  Blank     │                         │
│  │            │  │  Template  │                         │
│  │            │  │            │                         │
│  ├────────────┤  ├────────────┤                         │
│  │ Tour       │  │ Start from │                         │
│  │ Used 3x    │  │ scratch    │                         │
│  └────────────┘  └────────────┘                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Template card interactions:**
- **Hover** reveals: Use, Edit, Duplicate, Delete actions
- **Click** opens template editor (same editor as campaign, but saves as template)
- **Use** creates a new campaign pre-filled with template content
- Grid layout with responsive columns (3 on desktop, 2 on tablet, 1 on mobile)

**Starter templates (built-in, non-deletable):**
- Welcome Email — for new subscribers
- New Release — announce music with DSP links
- Monthly Newsletter — recurring update format
- Tour/Show Announcement — dates and ticket links
- Merch Drop — product showcase

### 4.7 Automation Flows (`/app/campaigns/automations`)

**List view** similar to campaigns list but for automation sequences:

```
┌─────────────────────────────────────────────────────────┐
│  Automations                          [+ New Automation] │
│─────────────────────────────────────────────────────────│
│  [All] [Active] [Paused] [Draft]                         │
│─────────────────────────────────────────────────────────│
│  ● Welcome Series      Active   3 steps   890 enrolled  │
│  ● Re-engagement       Active   2 steps   234 enrolled  │
│  ○ Win-back Flow        Draft   4 steps   —              │
│  ◐ Post-Purchase        Paused  2 steps   56 enrolled   │
└─────────────────────────────────────────────────────────┘
```

**Automation editor** — visual flow builder:

```
┌─────────────────────────────────────────────────────────┐
│  ← Welcome Series                  [Active ●] [Save]    │
│─────────────────────────────────────────────────────────│
│                                                          │
│  ┌─────────────────┐                                     │
│  │ 🔔 Trigger       │                                     │
│  │ New Subscriber   │                                     │
│  └────────┬────────┘                                     │
│           │                                              │
│      ⏱ Wait 1 hour                                      │
│           │                                              │
│  ┌────────┴────────┐                                     │
│  │ ✉️ Email 1       │                                     │
│  │ "Welcome!"      │                                     │
│  │ 42% open rate   │                                     │
│  └────────┬────────┘                                     │
│           │                                              │
│      ⏱ Wait 3 days                                      │
│           │                                              │
│  ┌────────┴────────┐                                     │
│  │ 🔀 Condition     │                                     │
│  │ Opened Email 1?  │                                     │
│  └──┬──────────┬───┘                                     │
│  Yes│          │No                                       │
│     │    ┌─────┴─────┐                                   │
│     │    │ ✉️ Email 2  │                                   │
│     │    │ "Check out"│                                   │
│     │    └─────┬─────┘                                   │
│     │          │                                         │
│  ┌──┴──────────┴───┐                                     │
│  │ ✅ End Flow      │                                     │
│  └─────────────────┘                                     │
│                                                          │
│  [+ Add Step]                                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Flow node types:**
| Node | Description |
|---|---|
| **Trigger** | What starts the flow (new subscriber, tag added, date, manual) |
| **Email** | Send a specific email (uses template or custom content) |
| **Wait** | Delay before next step (hours, days, or until specific time) |
| **Condition** | Branch based on engagement (opened, clicked, etc.) or profile data |
| **Tag** | Add or remove a tag from the recipient |
| **End** | Terminal node |

### 4.8 Audience Segments (`/app/campaigns/audiences`)

```
┌─────────────────────────────────────────────────────────┐
│  Audiences                              [+ New Segment]  │
│─────────────────────────────────────────────────────────│
│                                                          │
│  Built-in Segments                                       │
│  ┌─────────────────────────────────────────────────┐    │
│  │ All Subscribers              3,421 contacts      │    │
│  │ Active (opened in 30d)       1,890 contacts      │    │
│  │ Inactive (no open in 90d)      342 contacts      │    │
│  │ New (subscribed in 7d)          67 contacts      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Custom Segments                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ US Hip-Hop Fans              412 contacts        │    │
│  │ VIP Supporters               89 contacts         │    │
│  │ Tour Interest                234 contacts         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Component Architecture

### Component Tree (Atomic Design)

```
components/
  campaigns/
    atoms/
      CampaignStatusBadge.tsx        — Status pill with color coding
      CampaignMetricCard.tsx         — KPI card (delivered, opened, etc.)
      BlockHandle.tsx                — Drag handle for editor blocks
      BlockToolbar.tsx               — Per-block action bar
      RecipientCountBadge.tsx        — Live recipient count indicator
      SendTimeDisplay.tsx            — Formatted send time with timezone

    molecules/
      CampaignListRow.tsx            — Single campaign in list view
      CampaignListToolbar.tsx        — Search, filter, sort controls
      CampaignListTabs.tsx           — Status filter tabs
      CampaignStepIndicator.tsx      — Vertical wizard step nav
      EditorBlockWrapper.tsx         — Block container with actions
      AudienceConditionRow.tsx       — Single filter condition
      AudienceConditionGroup.tsx     — AND/OR condition group
      TemplateCard.tsx               — Template grid card with preview
      AutomationFlowNode.tsx         — Single node in flow editor
      AutomationFlowEdge.tsx         — Connection line between nodes
      EngagementChart.tsx            — Opens/clicks over time
      ClickMapTable.tsx              — Link click breakdown
      RecipientActivityRow.tsx       — Single recipient in activity list

    organisms/
      CampaignList.tsx               — Full campaign list with table
      CampaignEditor.tsx             — Three-panel editor layout
      CampaignEditorSetup.tsx        — Step 1: Setup form
      CampaignEditorContent.tsx      — Step 2: Block editor
      CampaignEditorAudience.tsx     — Step 3: Audience selector
      CampaignEditorReview.tsx       — Step 4: Review checklist
      CampaignEditorSend.tsx         — Step 5: Send/schedule
      CampaignPreviewPanel.tsx       — Live email preview (desktop/mobile)
      CampaignAnalyticsDashboard.tsx — Full analytics view
      TemplateLibrary.tsx            — Template grid with tabs
      TemplateEditor.tsx             — Template editing view
      AutomationFlowEditor.tsx       — Visual flow builder
      AutomationList.tsx             — Automation list view
      AudienceSegmentBuilder.tsx     — Segment condition builder
      AudienceSegmentList.tsx        — Segment list view

    blocks/                          — Email editor block components
      TextBlock.tsx                  — Rich text block
      ImageBlock.tsx                 — Image with upload
      ButtonBlock.tsx                — CTA button
      HeaderBlock.tsx                — Heading block
      DividerBlock.tsx               — Horizontal rule
      SpacerBlock.tsx                — Vertical spacer
      SocialLinksBlock.tsx           — Auto social links
      MusicLinksBlock.tsx            — DSP release links
      ColumnsBlock.tsx               — Two-column layout
      UnsubscribeBlock.tsx           — Required unsubscribe footer
      BlockRegistry.ts               — Block type definitions & registry
```

### Key Design Decisions

**Editor approach: Block-based (not full WYSIWYG drag-and-drop)**

Rationale:
- Full WYSIWYG email editors (like Mailchimp's) are enormously complex to build and maintain
- Block editors (like Notion, Linear) are simpler, more reliable, and match Jovie's design language
- Email HTML rendering is constrained anyway — blocks map cleanly to email-safe HTML tables
- Can evolve to full drag-and-drop later without rewriting

**Preview rendering: Server-side HTML generation**

Rationale:
- Email rendering differs significantly from web rendering
- Generate actual email HTML server-side, render in an iframe for preview
- Ensures WYSIWYG accuracy (what you see = what recipients get)
- Reuses existing email template infrastructure (`lib/email/templates/`)

**Automation editor: Vertical flow (not a full DAG canvas)**

Rationale:
- Full graph editors (like n8n or Zapier) require complex canvas libraries
- Email automations are inherently sequential with simple branches
- Vertical flow with indented branches covers 95% of use cases
- Can be built with CSS/flex, no canvas library needed
- If needs grow, can upgrade to reactflow later

---

## 6. Database Schema Changes

### New Tables

```sql
-- Creator-owned campaigns (distinct from admin campaignSequences)
CREATE TABLE creator_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Content
  name TEXT NOT NULL,                          -- Internal name
  subject TEXT,                                -- Email subject line
  preview_text TEXT,                           -- Email preview snippet
  from_name TEXT,                              -- Sender display name
  reply_to TEXT,                               -- Reply-to address
  content JSONB NOT NULL DEFAULT '[]',         -- Array of editor blocks

  -- Targeting
  audience_type TEXT NOT NULL DEFAULT 'all',   -- 'all' | 'segment' | 'manual'
  audience_segment_id UUID REFERENCES audience_segments(id),
  audience_manual_ids JSONB,                   -- Array of subscriber IDs
  estimated_recipients INTEGER DEFAULT 0,

  -- Status & Scheduling
  status TEXT NOT NULL DEFAULT 'draft',        -- draft | scheduled | sending | sent | failed | archived
  scheduled_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  template_id UUID REFERENCES campaign_templates(id),
  tags JSONB DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_creator_campaigns_creator ON creator_campaigns(creator_id);
CREATE INDEX idx_creator_campaigns_status ON creator_campaigns(status);
CREATE INDEX idx_creator_campaigns_scheduled ON creator_campaigns(scheduled_at)
  WHERE status = 'scheduled';

-- Reusable email templates
CREATE TABLE campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system template

  name TEXT NOT NULL,
  description TEXT,
  content JSONB NOT NULL DEFAULT '[]',       -- Array of editor blocks
  thumbnail_url TEXT,                        -- Preview thumbnail
  category TEXT DEFAULT 'custom',            -- 'welcome' | 'release' | 'newsletter' | 'tour' | 'custom'
  is_starter BOOLEAN NOT NULL DEFAULT FALSE, -- System-provided templates
  usage_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_templates_creator ON campaign_templates(creator_id);

-- Audience segments (reusable filter sets)
CREATE TABLE audience_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '[]',    -- Array of filter conditions
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE, -- System-defined segments

  -- Cached count (updated periodically)
  cached_count INTEGER DEFAULT 0,
  count_updated_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audience_segments_creator ON audience_segments(creator_id);

-- Per-campaign recipient tracking
CREATE TABLE campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES creator_campaigns(id) ON DELETE CASCADE,

  -- Recipient info (privacy-preserving)
  subscriber_id UUID,                        -- Reference to audience member
  recipient_hash TEXT NOT NULL,              -- SHA-256 of email

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | queued | sent | delivered | bounced | failed
  provider_message_id TEXT,                  -- Resend message ID

  -- Engagement (denormalized for fast queries)
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  click_count INTEGER NOT NULL DEFAULT 0,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  bounced_at TIMESTAMP WITH TIME ZONE,
  bounce_type TEXT,                           -- 'hard' | 'soft'

  -- Metadata
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX idx_campaign_recipients_hash ON campaign_recipients(recipient_hash);

-- Creator automation flows (extends existing campaignSequences concept)
CREATE TABLE creator_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,                -- 'new_subscriber' | 'tag_added' | 'date' | 'manual'
  trigger_config JSONB DEFAULT '{}',         -- Trigger-specific configuration
  steps JSONB NOT NULL DEFAULT '[]',         -- Array of flow steps
  status TEXT NOT NULL DEFAULT 'draft',      -- 'draft' | 'active' | 'paused'

  -- Stats (denormalized)
  enrolled_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_creator_automations_creator ON creator_automations(creator_id);
CREATE INDEX idx_creator_automations_status ON creator_automations(status);
```

### JSONB Schemas

**Campaign content blocks:**
```typescript
type BlockType =
  | 'header' | 'text' | 'image' | 'button' | 'divider'
  | 'spacer' | 'social_links' | 'music_links' | 'columns'
  | 'quote' | 'unsubscribe';

interface ContentBlock {
  id: string;           // Unique block ID (for reordering)
  type: BlockType;
  data: Record<string, unknown>;  // Block-type-specific data
  settings?: {
    alignment?: 'left' | 'center' | 'right';
    padding?: { top: number; bottom: number };
    backgroundColor?: string;
  };
}

// Example: Text block
{
  id: 'block_abc123',
  type: 'text',
  data: { html: '<p>Hello <strong>world</strong></p>' },
  settings: { alignment: 'left', padding: { top: 8, bottom: 8 } }
}

// Example: Button block
{
  id: 'block_def456',
  type: 'button',
  data: { text: 'Listen Now', url: 'https://...', color: '#7c3aed' },
  settings: { alignment: 'center' }
}
```

**Audience segment conditions:**
```typescript
interface SegmentCondition {
  id: string;
  field: string;        // 'country' | 'engagement_level' | 'subscription_date' | etc.
  operator: string;     // 'is' | 'is_not' | 'contains' | 'gt' | 'lt' | 'after' | 'before'
  value: string | number | boolean;
}

interface SegmentConditionGroup {
  logic: 'and' | 'or';
  conditions: SegmentCondition[];
}
```

**Automation flow steps:**
```typescript
type FlowStepType = 'email' | 'wait' | 'condition' | 'tag' | 'end';

interface FlowStep {
  id: string;
  type: FlowStepType;
  data: Record<string, unknown>;
  next?: string;          // ID of next step
  branches?: {            // For condition nodes
    yes: string;          // Step ID if condition is true
    no: string;           // Step ID if condition is false
  };
}
```

---

## 7. API Layer

### New API Routes

All routes are under `/api/campaigns/` (creator-facing) — separate from existing `/api/admin/campaigns/` (admin-facing).

```
# Campaign CRUD
GET    /api/campaigns                      — List campaigns (paginated, filterable)
POST   /api/campaigns                      — Create campaign
GET    /api/campaigns/[id]                 — Get campaign detail
PATCH  /api/campaigns/[id]                 — Update campaign
DELETE /api/campaigns/[id]                 — Archive campaign (soft delete)

# Campaign actions
POST   /api/campaigns/[id]/send            — Send campaign immediately
POST   /api/campaigns/[id]/schedule        — Schedule campaign
POST   /api/campaigns/[id]/cancel          — Cancel scheduled campaign
POST   /api/campaigns/[id]/duplicate       — Duplicate campaign
POST   /api/campaigns/[id]/test            — Send test email to creator

# Campaign analytics
GET    /api/campaigns/[id]/analytics       — Campaign performance metrics
GET    /api/campaigns/[id]/recipients      — Recipient activity (paginated)
GET    /api/campaigns/[id]/clicks          — Click map data

# Templates
GET    /api/campaigns/templates            — List templates
POST   /api/campaigns/templates            — Create template
GET    /api/campaigns/templates/[id]       — Get template
PATCH  /api/campaigns/templates/[id]       — Update template
DELETE /api/campaigns/templates/[id]       — Delete template

# Audience segments
GET    /api/campaigns/audiences            — List segments
POST   /api/campaigns/audiences            — Create segment
GET    /api/campaigns/audiences/[id]       — Get segment with live count
PATCH  /api/campaigns/audiences/[id]       — Update segment
DELETE /api/campaigns/audiences/[id]       — Delete segment
GET    /api/campaigns/audiences/[id]/count — Live recipient count
GET    /api/campaigns/audiences/preview    — Preview recipients for conditions

# Automations
GET    /api/campaigns/automations          — List automations
POST   /api/campaigns/automations          — Create automation
GET    /api/campaigns/automations/[id]     — Get automation detail
PATCH  /api/campaigns/automations/[id]     — Update automation
POST   /api/campaigns/automations/[id]/activate — Activate automation
POST   /api/campaigns/automations/[id]/pause    — Pause automation

# Email preview
POST   /api/campaigns/preview              — Render email HTML from blocks
```

### Authorization Pattern

Every route follows the existing pattern:
```typescript
const entitlements = await getCurrentUserEntitlements();
if (!entitlements.isAuthenticated) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
// Creator routes use entitlements.userId to scope all queries
// No isAdmin check needed — these are creator-facing routes
```

### Rate Limiting

| Endpoint | Limit | Window |
|---|---|---|
| Send campaign | 10 sends/hour | Per creator |
| Send test email | 20/hour | Per creator |
| Create campaign | 100/day | Per creator |
| Preview render | 60/minute | Per creator |

---

## 8. State Management

### TanStack Query Hooks

```typescript
// lib/queries/keys.ts — extend existing keys
campaigns: {
  all: ['campaigns'] as const,
  lists: () => [...queryKeys.campaigns.all, 'list'],
  list: (filters: CampaignFilters) => [...queryKeys.campaigns.lists(), filters],
  details: () => [...queryKeys.campaigns.all, 'detail'],
  detail: (id: string) => [...queryKeys.campaigns.details(), id],
  analytics: (id: string) => [...queryKeys.campaigns.all, 'analytics', id],
  recipients: (id: string, filters: RecipientFilters) =>
    [...queryKeys.campaigns.all, 'recipients', id, filters],
},
templates: {
  all: ['campaign-templates'] as const,
  list: () => [...queryKeys.templates.all, 'list'],
  detail: (id: string) => [...queryKeys.templates.all, id],
},
segments: {
  all: ['audience-segments'] as const,
  list: () => [...queryKeys.segments.all, 'list'],
  detail: (id: string) => [...queryKeys.segments.all, id],
  count: (id: string) => [...queryKeys.segments.all, 'count', id],
  preview: (conditions: SegmentCondition[]) =>
    [...queryKeys.segments.all, 'preview', conditions],
},
automations: {
  all: ['automations'] as const,
  list: () => [...queryKeys.automations.all, 'list'],
  detail: (id: string) => [...queryKeys.automations.all, id],
},
```

### New Query Hooks

```
lib/queries/
  useCampaigns.ts            — CRUD hooks for campaigns
  useCampaignAnalytics.ts    — Analytics data hooks
  useCampaignTemplates.ts    — Template CRUD hooks
  useAudienceSegments.ts     — Segment CRUD and count hooks
  useAutomations.ts          — Automation CRUD hooks
  useCampaignPreview.ts      — Email preview rendering hook
```

### Editor State

The campaign editor uses local state (not TanStack Query) for in-progress editing, with debounced auto-save:

```typescript
// Custom hook: useCampaignEditor(campaignId)
// - Loads campaign from server on mount
// - Manages local block state with useReducer
// - Auto-saves to server every 3 seconds (debounced)
// - Provides undo/redo via action history
// - Tracks dirty state for unsaved changes warning
```

### URL State (nuqs)

Following existing patterns, use `nuqs` for:
- Campaign list: `?status=draft&sort=created_at&dir=desc&page=1&size=20&q=search`
- Analytics: `?tab=overview&range=7d`
- Template library: `?tab=my_templates&category=release`

---

## 9. Implementation Phases

### Phase 1: Foundation (Core CRUD + List View)

**Goal:** Creators can create, view, and manage campaigns. No sending yet.

| Task | Details |
|---|---|
| DB schema migration | `creator_campaigns`, `campaign_templates`, `audience_segments` tables |
| Route constants | Add `CAMPAIGNS`, `CAMPAIGNS_NEW`, etc. to `constants/routes.ts` |
| API routes — campaigns CRUD | GET/POST/PATCH/DELETE for campaigns |
| API routes — templates CRUD | GET/POST/PATCH/DELETE for templates |
| Sidebar navigation | Add "Campaigns" section to app sidebar |
| Campaign list page | Table with status tabs, search, sort, pagination |
| Campaign list row | Status badge, subject, audience count, dates |
| Empty state | Zero-campaign onboarding |
| Campaign detail page | Basic form: name, subject, preview text, from name |
| Query hooks | `useCampaigns`, `useCampaignTemplates` |

**Delivers:** Campaign management shell — creators can create drafts and organize them.

### Phase 2: Content Editor + Templates

**Goal:** Creators can build email content using the block editor.

| Task | Details |
|---|---|
| Block registry | Type definitions for all block types |
| Block components | Text, Image, Button, Header, Divider, Spacer |
| Block editor | Add/remove/reorder blocks with DnD |
| Block settings | Inline alignment, padding, color controls |
| Email HTML renderer | Server-side block-to-email-HTML conversion |
| Live preview panel | Iframe-based desktop/mobile preview |
| Template library UI | Grid view with starter templates |
| Template editor | Save/load templates using block editor |
| Music/Social blocks | DSP links and social links auto-populated from profile |
| Unsubscribe block | Auto-inserted, non-removable footer block |
| Campaign preview API | POST endpoint to render blocks as HTML |

**Delivers:** Full content creation capability with real-time preview.

### Phase 3: Audience Targeting + Sending

**Goal:** Creators can select audiences and send campaigns.

| Task | Details |
|---|---|
| Audience segment builder | Condition rows with field/operator/value |
| Segment CRUD API | Create, save, and reuse segments |
| Live recipient count | Real-time count as conditions change |
| Recipient preview | Sample of matching audience members |
| `campaign_recipients` table | Per-recipient delivery tracking |
| Send campaign API | Queue emails via existing job system |
| Schedule campaign API | Cron-based scheduled sends |
| Send confirmation modal | Recipient count, warnings, confirm/cancel |
| Test email sending | Send preview to creator's own email |
| Review step | Validation checklist with warnings |
| Campaign status updates | Real-time status progression (sending → sent) |

**Delivers:** End-to-end campaign workflow — create, target, send.

### Phase 4: Analytics Dashboard

**Goal:** Creators can analyze campaign performance.

| Task | Details |
|---|---|
| Analytics API | Aggregate engagement metrics per campaign |
| Metric cards | Delivered, opened, clicked, unsubscribed, bounced |
| Engagement chart | Opens/clicks over time (recharts area chart) |
| Click map | Link-level click breakdown table |
| Recipient activity | Filterable list of per-recipient engagement |
| Device breakdown | Pie chart (desktop/mobile/tablet) |
| Campaign comparison | Compare metrics across campaigns (stretch) |
| Export CSV | Download recipient activity as CSV |

**Delivers:** Full analytics visibility into campaign performance.

### Phase 5: Automations (Drip Campaigns)

**Goal:** Creators can build automated email sequences.

| Task | Details |
|---|---|
| `creator_automations` table | Migration and Drizzle schema |
| Automation CRUD API | Create/update/activate/pause flows |
| Automation list page | List view with status and enrollment counts |
| Flow editor UI | Vertical flow builder with node types |
| Trigger configuration | New subscriber, tag added, date-based |
| Wait step | Configurable delay (hours/days) |
| Condition step | Branch on engagement or profile data |
| Flow processing | Extend existing cron processor for creator automations |
| Enrollment management | Auto-enroll on trigger, advance through steps |
| Flow analytics | Per-step engagement metrics |

**Delivers:** Automated email sequences for common creator workflows.

---

## 10. File Structure

```
apps/web/
├── app/app/(shell)/
│   └── campaigns/
│       ├── page.tsx                          — Campaign list (server component)
│       ├── new/
│       │   └── page.tsx                      — New campaign (redirects to editor)
│       ├── [id]/
│       │   ├── page.tsx                      — Campaign editor
│       │   ├── preview/
│       │   │   └── page.tsx                  — Full-screen preview
│       │   └── analytics/
│       │       └── page.tsx                  — Campaign analytics
│       ├── templates/
│       │   ├── page.tsx                      — Template library
│       │   └── [id]/
│       │       └── page.tsx                  — Template editor
│       ├── automations/
│       │   ├── page.tsx                      — Automation list
│       │   └── [id]/
│       │       └── page.tsx                  — Automation flow editor
│       └── audiences/
│           ├── page.tsx                      — Segment list
│           └── [id]/
│               └── page.tsx                  — Segment editor
│
├── app/api/campaigns/
│   ├── route.ts                              — GET (list) + POST (create)
│   ├── [id]/
│   │   ├── route.ts                          — GET + PATCH + DELETE
│   │   ├── send/route.ts                     — POST
│   │   ├── schedule/route.ts                 — POST
│   │   ├── cancel/route.ts                   — POST
│   │   ├── duplicate/route.ts                — POST
│   │   ├── test/route.ts                     — POST
│   │   ├── analytics/route.ts                — GET
│   │   ├── recipients/route.ts               — GET
│   │   └── clicks/route.ts                   — GET
│   ├── templates/
│   │   ├── route.ts                          — GET + POST
│   │   └── [id]/route.ts                     — GET + PATCH + DELETE
│   ├── audiences/
│   │   ├── route.ts                          — GET + POST
│   │   ├── preview/route.ts                  — GET (preview recipients)
│   │   └── [id]/
│   │       ├── route.ts                      — GET + PATCH + DELETE
│   │       └── count/route.ts                — GET (live count)
│   ├── automations/
│   │   ├── route.ts                          — GET + POST
│   │   └── [id]/
│   │       ├── route.ts                      — GET + PATCH
│   │       ├── activate/route.ts             — POST
│   │       └── pause/route.ts                — POST
│   └── preview/route.ts                      — POST (render email HTML)
│
├── components/campaigns/
│   ├── atoms/
│   │   ├── CampaignStatusBadge.tsx
│   │   ├── CampaignMetricCard.tsx
│   │   ├── BlockHandle.tsx
│   │   ├── BlockToolbar.tsx
│   │   ├── RecipientCountBadge.tsx
│   │   └── SendTimeDisplay.tsx
│   ├── molecules/
│   │   ├── CampaignListRow.tsx
│   │   ├── CampaignListToolbar.tsx
│   │   ├── CampaignListTabs.tsx
│   │   ├── CampaignStepIndicator.tsx
│   │   ├── EditorBlockWrapper.tsx
│   │   ├── AudienceConditionRow.tsx
│   │   ├── AudienceConditionGroup.tsx
│   │   ├── TemplateCard.tsx
│   │   ├── AutomationFlowNode.tsx
│   │   ├── AutomationFlowEdge.tsx
│   │   ├── EngagementChart.tsx
│   │   ├── ClickMapTable.tsx
│   │   └── RecipientActivityRow.tsx
│   ├── organisms/
│   │   ├── CampaignList.tsx
│   │   ├── CampaignEditor.tsx
│   │   ├── CampaignEditorSetup.tsx
│   │   ├── CampaignEditorContent.tsx
│   │   ├── CampaignEditorAudience.tsx
│   │   ├── CampaignEditorReview.tsx
│   │   ├── CampaignEditorSend.tsx
│   │   ├── CampaignPreviewPanel.tsx
│   │   ├── CampaignAnalyticsDashboard.tsx
│   │   ├── TemplateLibrary.tsx
│   │   ├── TemplateEditor.tsx
│   │   ├── AutomationFlowEditor.tsx
│   │   ├── AutomationList.tsx
│   │   ├── AudienceSegmentBuilder.tsx
│   │   └── AudienceSegmentList.tsx
│   └── blocks/
│       ├── TextBlock.tsx
│       ├── ImageBlock.tsx
│       ├── ButtonBlock.tsx
│       ├── HeaderBlock.tsx
│       ├── DividerBlock.tsx
│       ├── SpacerBlock.tsx
│       ├── SocialLinksBlock.tsx
│       ├── MusicLinksBlock.tsx
│       ├── ColumnsBlock.tsx
│       ├── QuoteBlock.tsx
│       ├── UnsubscribeBlock.tsx
│       └── BlockRegistry.ts
│
├── lib/
│   ├── campaigns/
│   │   ├── blocks-to-html.ts                — Block → email HTML renderer
│   │   ├── block-schemas.ts                 — Zod schemas for block data
│   │   ├── segment-evaluator.ts             — Evaluate segment conditions against DB
│   │   └── campaign-sender.ts               — Orchestrate campaign sending
│   ├── queries/
│   │   ├── useCampaigns.ts
│   │   ├── useCampaignAnalytics.ts
│   │   ├── useCampaignTemplates.ts
│   │   ├── useAudienceSegments.ts
│   │   ├── useAutomations.ts
│   │   └── useCampaignPreview.ts
│   └── db/schema/
│       └── campaigns.ts                     — Drizzle table definitions
│
└── drizzle/migrations/
    └── XXXX_add_creator_campaigns.sql       — New migration (NEVER edit existing)
```

---

## 11. Technical Constraints

### Must Follow

| Constraint | Source |
|---|---|
| Node 24.x, pnpm 9.15.4 | `agents.md` tooling requirements |
| No `db.transaction()` | Neon HTTP driver limitation |
| `import { db } from '@/lib/db'` only | Single driver policy |
| Migration files are immutable | `.claude/hooks/` enforcement |
| Route constants via `APP_ROUTES` | No hardcoded paths |
| `'use client'` only where needed | Server components by default |
| No server imports in client files | ESLint server boundary rules |
| Conventional commits | Hook enforcement |
| No `biome-ignore` comments | Fix issues, don't suppress |
| Batch DB inserts | No loop with individual inserts |
| Dates serialized as ISO strings | Server → client boundary |
| AbortSignal in all queryFn | TanStack Query requirement |
| staleTime + gcTime in all useQuery | Cache config requirement |
| API routes run on Node.js runtime | No Edge runtime |

### Dependencies to Add

| Package | Purpose | Exists? |
|---|---|---|
| `dnd-kit` | Block reordering in editor | Yes (already in project) |
| `recharts` | Analytics charts | Yes (already in project) |
| `nuqs` | URL state management | Yes (already in project) |
| `sonner` | Toast notifications | Yes (already in project) |
| `react-hook-form` | Form management | Yes (already in project) |
| `motion` | Animations | Yes (already in project) |
| None | All needed deps exist | - |

### Performance Targets

| Metric | Target |
|---|---|
| Campaign list TTI | < 500ms |
| Editor load | < 800ms |
| Preview render | < 300ms |
| Send test email | < 2s |
| Analytics dashboard load | < 1s |
| Auto-save debounce | 3s |
| Live recipient count | < 500ms |

---

## Summary

This plan delivers a **5-phase, incrementally shippable** campaign management system that:

1. **Phase 1** — Gets campaigns into the creator's hands (list + basic CRUD)
2. **Phase 2** — Enables content creation with a block editor + templates
3. **Phase 3** — Adds targeting and actual email sending
4. **Phase 4** — Provides performance analytics
5. **Phase 5** — Introduces automation flows for drip campaigns

Each phase delivers standalone value. The system reuses Jovie's existing backend infrastructure (Resend, job queue, tracking, suppression) while building a clean, Linear-inspired creator-facing interface using the existing component library (Radix + Tailwind + OKLCH design tokens).

No new dependencies are needed. Every existing pattern in the codebase (atomic design, TanStack Query, nuqs URL state, dnd-kit, recharts) is leveraged.
