---
name: idea-radar
description: |
  Weekly idea-discovery sweep (epic GH-10354). Discovers new software/MRR
  opportunities across Reddit, HN, X, YouTube, TikTok, Polymarket, and GitHub
  using /last30days, evaluates each via the 10x → thin-MVP → MRR-per-effort
  pipeline, delivers ranked cards to Slack #idea-radar, and reconciles
  thumbs-up/down reactions to update learned-preferences. Runs once a week;
  idempotent. (Jovie AgentOS)
argument-hint: "[--dry-run] [--reconcile-only]"
author: jovie-agentos
metadata:
  hermes:
    tags: [idea-radar, discovery, weekly, slack]
    category: product-discovery
    schedule: "0 9 * * 1"  # Monday 09:00 local
    cost-cap: 1.00
---

# Idea Radar — Weekly Discovery Sweep

Continuous idea discovery loop from epic [GH-10354](https://github.com/JovieInc/Jovie/issues/10354).
One run = discover → evaluate → deliver → reconcile.

## Arguments

- `--dry-run` — run discovery and evaluation but skip Slack posting and Linear issue creation
- `--reconcile-only` — skip discovery; only reconcile reactions/comments from the previous week's cards

## Phase 0: Prerequisites

```bash
# Confirm Slack bot is in #idea-radar
# If channel does not exist, stop and message Tim: "Create #idea-radar and invite the Jovie bot."
```

Load learned preferences from gbrain:
```
mcp__gbrain__query: "idea-radar learned preferences user feedback"
```
Store as `learnedPrefs` — used to deprioritize rejected themes and boost approved ones.

Load Linear idea-radar ledger to avoid re-posting:
```
mcp__claude_ai_Linear__list_issues: { team: "Jovie", label: "idea-radar" }
```
Store existing idea titles as `seenIdeas` (dedup set).

---

## Phase 1: Discover (call /last30days)

Run two tiers of sweeps **in parallel** using `/last30days`:

### Tier A — Adjacent (creator / music / marketing / fitness / health)

```
/last30days "indie hacker SaaS launch new product creator tools" \
  --sources reddit,hn,producthunt,youtube,github --days 7
/last30days "musician artist income tools revenue" \
  --sources reddit,hn,x,youtube --days 7
/last30days "fitness health app launch subscription" \
  --sources reddit,hn,tiktok --days 7
```

### Tier B — Wildcard (any domain with strong MRR signal)

```
/last30days "launched profitable bootstrapped indie side project" \
  --sources reddit,hn,polymarket --days 7
/last30days "acquired micro-saas flippa acquire.com" \
  --sources reddit,hn --days 7
```

Merge all briefs. Deduplicate by URL. Filter out any idea whose title fuzzy-matches
an entry in `seenIdeas` or a rejected theme from `learnedPrefs`.

**Cost gate:** each `/last30days` call must stay under $0.20. Total phase 1 budget: $0.60.

---

## Phase 2: Evaluate each candidate idea

For each distinct idea/product signal (cap: 20 per sweep to bound cost):

### 2.1 Find same/similar + adjacent variants

```
mcp__gbrain__search: "<idea title> similar products alternatives"
/last30days "<idea title> competitor complaints" --sources reddit,hn --days 90
```

### 2.2 10x the idea

> "What would 10× this look like if it had 100× the resources and ambition?"

Prompt a model (via `free-model-router.ts` or the current session model):
```
Given: <idea title and description>
Adjacent signals: <top 3 from 2.1>

1. 10× version: <one-sentence 10× statement>
2. Thin MVP of the 10×: <what is the smallest version that proves the 10× hypothesis?>
3. MRR opportunity score (0–10):
   reach × frequency × annoyance × WTP × ATP ÷ effort
   Explain each dimension in one word.
```

### 2.3 Compute go/no-go

- Score ≥ 7 → **GO** (post to #idea-radar, open Linear issue)
- Score 5–6 → **MAYBE** (post with lower priority label)
- Score < 5 → **SKIP** (log to gbrain as low-signal, do not post)

Apply `learnedPrefs` boost/penalty: +1 for themes Tim has 👍'd before, −1 for themes he has 👎'd.

---

## Phase 3: Deliver to Slack #idea-radar

For each GO/MAYBE idea (skip if `--dry-run`):

Post a card to `#idea-radar`:

```
🎯 *<idea title>* — Score: <X>/10  |  <adjacent-domain tag>

> <10× statement>

**Thin MVP:** <1 sentence>
**Signal source:** <top URL from /last30days>
**Engagement:** <score> on <source>

👍 = go build (opens Linear issue)  👎 = reject (logged)
```

Record the Slack message timestamp + idea metadata to gbrain:
```
mcp__gbrain__put_page:
  slug: "idea-radar/<iso-date>/<slug>"
  content: { title, score, slack_ts, status: "pending" }
```

Open a Linear issue (child of GH-10354 / JOV-3200):
```
mcp__claude_ai_Linear__create_issue:
  team: "Jovie"
  title: "[idea-radar] <title>"
  description: |
    Score: <X>/10
    10×: <statement>
    Thin MVP: <description>
    Signal: <top URL>
    Slack thread: <link>
  labels: ["idea-radar", "discovery"]
  parent: <JOV-3200 or the Linear equivalent of GH-10354>
```

---

## Phase 4: Reconcile reactions (always runs, even with --reconcile-only)

Load last week's idea-radar gbrain pages:
```
mcp__gbrain__search: "idea-radar status:pending"
```

For each pending idea, fetch Slack reactions:
```
# Use Slack API via browse or MCP
GET https://slack.com/api/reactions.get?channel=<#idea-radar>&timestamp=<slack_ts>
```

Act on each:
- 👍 → update Linear to `In Progress`, update gbrain `status: "go"`, update `learnedPrefs` with the idea's domain/theme as a positive signal
- 👎 → update Linear to `Cancelled`, update gbrain `status: "rejected"`, add domain/theme to `learnedPrefs` negative signals, record reason from Tim's reply comment if present
- No reaction after 7 days → update gbrain `status: "expired"`, close the Linear issue as `Won't Fix`

---

## Phase 5: Distill learned preferences

After reconciliation, update the living preferences note in gbrain:

```
mcp__gbrain__put_page:
  slug: "idea-radar/learned-preferences"
  content: |
    # Idea Radar Learned Preferences
    Updated: <iso date>

    ## Boost (Tim has approved signals like these)
    <bulleted list of domains/themes with 👍 count>

    ## Suppress (Tim has rejected signals like these)
    <bulleted list with 👎 count and optional reason>

    ## Score distribution
    Avg score of GO ideas: <X>
    Total ideas evaluated: <N>
    Acceptance rate: <N go / N total>
```

---

## Output

```
Idea Radar sweep complete.

Discovered: <N> raw signals
Evaluated: <N> candidates  
GO: <N> | MAYBE: <N> | Skipped: <N>
Posted to #idea-radar: <N> cards
Reactions reconciled: <N>
Estimated cost: $<X>
```

## Hermes schedule (config.air.template.yaml)

This skill runs weekly via Hermes-Air. The schedule entry is:
```yaml
schedules:
  - name: idea-radar-sweep
    cron: "0 9 * * 1"   # Monday 09:00 local
    skill: idea-radar
    cost_cap_usd: 1.00
```
