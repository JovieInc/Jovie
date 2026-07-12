---
{
  "id": "jovie-youtube-channel-optimization",
  "title": "YouTube Channel Optimization",
  "version": "0.1.0",
  "problemStatement": "My YouTube channel looks unfinished — wrong categories, missing links, weak playlists, and thumbnails that do not earn the click — so new viewers bounce before they hear the music.",
  "triggerConditions": [
    "Artist connects a YouTube channel (on-connect)",
    "Artist requests a channel optimization from chat or opportunity inbox (on-demand)",
    "Scheduled weekly hygiene sweep when YouTube connector is healthy"
  ],
  "requiredInputs": [
    {
      "name": "channelId",
      "description": "YouTube channel ID for the connected artist account",
      "example": "UCxxxxxxxxxxxxxxxxxxxxxx"
    },
    {
      "name": "artistName",
      "description": "Canonical artist display name used in titles and descriptions",
      "example": "Tim White"
    }
  ],
  "steps": [
    {
      "kind": "tool_call",
      "tool": "analyzePackaging",
      "description": "Audit recent uploads: title/thumbnail promise, first-30s hook, category fit, and niche priors",
      "inputs": { "channelId": "{{channelId}}" }
    },
    {
      "kind": "prompt",
      "description": "Propose category and metadata fixes in the artist's voice",
      "prompt": "Given the packaging audit for channel {{channelId}} (artist {{artistName}}), list category mismatches, missing end-screen/default playlist links, and description template gaps. Prioritize by expected watch-minutes lift. No hashtag walls."
    },
    {
      "kind": "prompt",
      "description": "Plan backlink deployment across channel banner, about links, and video descriptions",
      "prompt": "Draft a backlink deployment plan for {{artistName}} that points fans to the canonical Jovie smart link. Include where each link goes (banner, about, top videos) and copy that stays under platform limits."
    },
    {
      "kind": "prompt",
      "description": "Design playlist strategy (series, evergreen, release-aligned)",
      "prompt": "Propose a playlist architecture for channel {{channelId}} that supports discovery and binge sessions. Include naming, order rules, and which existing videos seed each list."
    },
    {
      "kind": "tool_call",
      "tool": "analyzePackaging",
      "description": "Score current thumbnails/titles for the top N videos before overhaul recommendations",
      "inputs": { "channelId": "{{channelId}}", "mode": "thumbnail_pass" }
    },
    {
      "kind": "prompt",
      "description": "Measurement plan bound to watch-minutes-per-impression (not CTR alone)",
      "prompt": "Define a 14-day measurement plan for channel {{channelId}} using watch-minutes-per-impression as the primary success metric. Include baseline capture, what not to optimize for (raw CTR vanity), and when to re-run this playbook."
    }
  ],
  "successMetric": {
    "name": "Watch minutes per impression",
    "source": "custom_event",
    "eventName": "youtube_watch_minutes_per_impression",
    "direction": "increase",
    "window": "14d after run"
  },
  "evalSeeds": [
    {
      "name": "founder-channel-baseline",
      "input": {
        "channelId": "UC_founder_dogfood",
        "artistName": "Tim White"
      },
      "expected": "Audit returns ranked packaging issues, playlist plan has ≥2 lists, measurement plan names watch-minutes-per-impression, and no step recommends CTR-only optimization."
    },
    {
      "name": "new-channel-sparse-uploads",
      "input": {
        "channelId": "UC_sparse_new",
        "artistName": "New Artist"
      },
      "expected": "Playbook degrades gracefully with a 'need more uploads' note while still producing category/link hygiene recommendations; does not invent fake video inventory."
    },
    {
      "name": "thumbnail-heavy-catalog",
      "input": {
        "channelId": "UC_thumb_debt",
        "artistName": "Catalog Artist"
      },
      "expected": "Second analyzePackaging pass flags weak thumbnail/title pairs; overhaul list is capped and ordered by expected watch-minutes impact."
    }
  ],
  "costEstimate": {
    "credits": 8,
    "usd": 0.15,
    "notes": "Two analyzePackaging tool calls + LLM drafting. YouTube Data API quota: thumbnails.set ~50 units/call with regional daily caps — thumbnail *application* is out of band of this playbook's read/plan steps and must respect connector rate limits."
  },
  "requiredTools": ["analyzePackaging"],
  "requiredConnectors": ["youtube"],
  "requiredEntitlements": ["aiCanUseTools"]
}
---

# YouTube Channel Optimization

Dogfood-proven SEO/channel-hygiene workflow (sibling of closed-loop packaging
optimization, not a duplicate). Sequence:

1. **Audit** packaging with `analyzePackaging`
2. **Category / metadata fixes** (prompt plan)
3. **Backlink deployment** plan to the smart link
4. **Playlist strategy**
5. **Thumbnail overhaul** prioritization (second packaging pass)
6. **Measurement** on watch-minutes-per-impression

## Guardrails

- Primary metric is **watch-minutes-per-impression**, not CTR vanity.
- Thumbnail *generation* rides the shared image-gen gateway when executed;
  this playbook plans first and does not force-apply API-heavy writes without
  operator confirmation in later executors.
- Requires YouTube OAuth connector scope sufficient to read channel + video
  metadata; write scopes are optional until apply-steps ship.
