---
name: last30days
description: |
  Multi-source signal search across Reddit, HN, X/Twitter, YouTube, TikTok,
  Polymarket, GitHub, and the web — scored by real engagement (upvotes, likes,
  prediction money) and synthesized to one brief. Use for Idea Radar discovery
  sweeps and market-complaint research (ICP pain points, competitor complaints,
  RP-clone signals). Globally installed via mvanhorn/last30days-skill v3.8.3+.
argument-hint: "last30days <topic> | last30days competitors of <app X> complaints"
author: mvanhorn
metadata:
  hermes:
    tags: [research, signals, reddit, youtube, tiktok, market-intel]
    category: research
    cost-cap: 0.10
---

# last30days (project reference)

The `last30days` skill is globally installed at `~/.claude/skills/last30days/` via
[mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill). This
project-level file registers it as a Jovie project dependency so `skills-lock.json`
and routing rules stay in sync.

**Invoke it directly** — the harness loads the global install automatically:

```
/last30days <topic>
```

## Example invocations for Jovie use-cases

```
# Idea Radar sweep — adjacent creator/music SaaS signals this week
/last30days "indie hacker SaaS creator tools launched" --days 7

# Market-complaint research — competitor pain points
/last30days "DistroKid complaints problems artists" --days 30
/last30days "TuneCore frustrated reddit" --days 30

# ICP discovery — what artists complain about on YouTube/TikTok
/last30days "music distribution royalties complaints" --days 30
```

## Keys and sessions

The skill works without keys (falls back to public search APIs). For full
coverage including authenticated Reddit/X/TikTok results, provide via Doppler:

| Env var | Source | Notes |
|---------|--------|-------|
| `SCRAPECREATORS_API_KEY` | ScrapeCr | Primary — unlocks YouTube, TikTok, Instagram |
| `BRAVE_API_KEY` | Brave | Web search fallback |
| `OPENROUTER_API_KEY` | OpenRouter | Synthesis model (uses free tier by default) |

See `~/.claude/skills/last30days/SKILL.md` for the full contract and engine details.

## Cost cap

Each `/last30days` call should cost < $0.10. The Idea Radar weekly sweep caps
total spend at $1.00 across all calls. Monitor via Doppler cost dashboard.
