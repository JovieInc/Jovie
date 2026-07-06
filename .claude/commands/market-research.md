---
description: Market-complaint research — find all user complaints and pain points about a competitor app, platform, or category across YouTube, Reddit, App Store, X, and TikTok using /last30days
tags: [research, market-intel, competitors, icp]
---

# /market-research — Market-Complaint Research

Find all public complaints, pain points, and frustrations about a competitor app or
category. Used for RP-clone research, pep-AI ICP profiling, and go/no-go decisions.
Powered by `/last30days`.

## Arguments

```
/market-research <target>
/market-research <target> --window <days>   # default: 30
/market-research <target> --sources <list>  # default: reddit,hn,youtube,x,tiktok
```

**Target examples:**
- `DistroKid` — specific competitor
- `music distribution platforms` — category
- `TuneCore` — specific competitor
- `streaming royalties` — pain-point category

## Phase 1: Run multi-query /last30days sweep

Fire three query variants in parallel (to surface complaints from different angles):

```
/last30days "<target> complaints problems frustrated" --days <window>
/last30days "<target> worst thing hate review" --days <window>
/last30days "<target> switched left left why alternative" --days <window>
```

Merge results. Deduplicate by URL.

## Phase 2: Extract complaint taxonomy

From the merged brief, cluster complaints into themes:

| Theme | Example | Frequency | Severity (1-5) |
|-------|---------|-----------|----------------|
| Pricing | "they take 30% off the top" | high | 4 |
| Support | "support takes weeks to respond" | medium | 3 |
| … | … | … | … |

Sort by (frequency × severity) descending.

## Phase 3: ICP pain-point brief

Emit a structured brief for product/ICP use:

```markdown
## Market Research: <target>

**Window:** last <N> days  
**Sources:** <list>

### Top Complaints (ranked by frequency × severity)

1. **<Theme>** (freq: high, sev: 4/5)
   > "<most-upvoted direct quote>"
   - <2nd supporting quote>
   Source: <URL>

2. **<Theme>** …

### Unmet Needs

<What users explicitly say they wish existed / would pay for>

### Switching Triggers

<What finally made users leave / consider leaving>

### Jovie Opportunity

<1-2 sentence take: does this open a clear wedge for Jovie?>
```

## Phase 4: Optional — App Store reviews

If `--sources` includes `appstore`:

```bash
# Use browse to fetch App Store reviews sorted by "Most Critical"
/browse "https://apps.apple.com/us/app/<slug>/reviews?sort=mostCritical"
# Extract top 10 1-2 star reviews; add to complaint taxonomy
```

## Output

Save the brief to `.context/market-research/<target>-<date>.md` for future reference.

If run from a Hermes context (no interactive session), emit JSON:

```json
{
  "target": "<target>",
  "window_days": 30,
  "top_complaints": [
    {"theme": "Pricing", "frequency": "high", "severity": 4, "quote": "…", "url": "…"}
  ],
  "unmet_needs": ["…"],
  "switching_triggers": ["…"],
  "opportunity_signal": "…"
}
```

## Rules

- Stick to `/last30days` for signal gathering — do not manually search each platform.
- Quote real posts, not paraphrases. Always include the source URL.
- Keep cost under $0.30 per research run (3 last30days calls × $0.10 cap each).
- Do NOT invent complaints. If `/last30days` returns no results for a query, say so.
