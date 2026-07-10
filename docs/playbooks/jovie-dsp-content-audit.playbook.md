---
{
  "id": "jovie-dsp-content-audit",
  "title": "DSP Content Audit",
  "version": "0.1.0",
  "problemStatement": "My music is scattered across YouTube/VEVO, Spotify, Apple Music, TikTok, and SoundCloud with wrong credits, orphaned uploads, and impostor profiles — fans cannot find the real me and I do not know what to claim first.",
  "triggerConditions": [
    "New-artist onboarding after identity is partially linked",
    "Scheduled catalog sweep (weekly) when ≥1 DSP connector is linked",
    "Artist requests a content audit from chat or opportunity inbox (on-demand)"
  ],
  "requiredInputs": [
    {
      "name": "artistId",
      "description": "Internal artist/profile id used as the identity hub",
      "example": "usr_01artist"
    },
    {
      "name": "canonicalName",
      "description": "Preferred spelling of the artist name for match scoring",
      "example": "Tim White"
    },
    {
      "name": "knownExternalIds",
      "description": "Optional JSON map of already-confirmed DSP ids (spotify, apple, youtube, …)",
      "example": "{\"spotify\":\"4u…\"}"
    }
  ],
  "steps": [
    {
      "kind": "prompt",
      "description": "Inventory linked connectors and state per-source data feasibility",
      "prompt": "For artist {{artistId}} ({{canonicalName}}), list connected DSPs and for each state whether official API data is available for ownership/catalog audit. Flag Spotify/Apple as official-API-first (no scraping). Flag VEVO as no public API. TikTok/SoundCloud as best-effort with ToS constraints."
    },
    {
      "kind": "tool_call",
      "tool": "analyzePackaging",
      "description": "When YouTube is linked, audit channel/video packaging for misattribution signals and orphaned uploads",
      "inputs": { "artistId": "{{artistId}}", "mode": "ownership_signals" }
    },
    {
      "kind": "prompt",
      "description": "Cross-platform misattribution and orphaned-content detection plan",
      "prompt": "Using knownExternalIds={{knownExternalIds}} and connector inventory, produce a detection matrix for {{canonicalName}} across YouTube/VEVO, Spotify, Apple Music, TikTok, and SoundCloud. For each platform include: data source feasibility, match signals, and impostor-profile heuristics. Do not recommend scraping banned surfaces."
    },
    {
      "kind": "prompt",
      "description": "Channel/profile ownership claim procedures (human-approval gated for any outbound contact)",
      "prompt": "For each high-confidence misattribution or impostor hit for {{canonicalName}}, draft an ownership-claim checklist. ANY outbound contact (distributor email, platform claim form submission) must be marked human-approval-gated. Never embed private distributor rosters — reference gbrain slug only if needed."
    },
    {
      "kind": "prompt",
      "description": "Prioritized remediation queue + success measurement",
      "prompt": "Rank remediation items for artist {{artistId}} by fan-facing impact (catalog-coverage delta and misattributions resolved). Output a queue the artist can approve item-by-item."
    }
  ],
  "successMetric": {
    "name": "Misattributions resolved per artist",
    "source": "custom_event",
    "eventName": "dsp_misattribution_resolved",
    "direction": "increase",
    "window": "30d after run"
  },
  "evalSeeds": [
    {
      "name": "fully-linked-catalog",
      "input": {
        "artistId": "usr_linked",
        "canonicalName": "Catalog Artist",
        "knownExternalIds": "{\"spotify\":\"spotify:artist:abc\",\"youtube\":\"UCabc\"}"
      },
      "expected": "Detection matrix covers all five platforms with feasibility notes; YouTube path uses analyzePackaging; no scrape recommendation for Spotify/Apple; remediation queue is non-empty and approval-gated for outbound contact."
    },
    {
      "name": "youtube-only-partial-identity",
      "input": {
        "artistId": "usr_yt_only",
        "canonicalName": "Emerging Artist",
        "knownExternalIds": "{\"youtube\":\"UCnew\"}"
      },
      "expected": "Playbook still runs; non-linked DSPs appear as 'connector required' rather than failures; success metric framing remains misattributions resolved / coverage delta."
    },
    {
      "name": "impostor-profile-suspect",
      "input": {
        "artistId": "usr_impostor",
        "canonicalName": "Popular Name",
        "knownExternalIds": "{}"
      },
      "expected": "Impostor heuristics described without auto-filing claims; every outbound step is human-approval-gated; no private distributor roster content in the output."
    }
  ],
  "costEstimate": {
    "credits": 6,
    "usd": 0.1,
    "notes": "Mostly prompt planning plus optional analyzePackaging when YouTube is linked. Official-API-first: no scrape quota. VEVO has no public API — detection is manual/evidence-pack only."
  },
  "requiredTools": ["analyzePackaging"],
  "requiredConnectors": [],
  "requiredEntitlements": ["aiCanUseTools"]
}
---

# DSP Content Audit

Cross-platform misattribution and orphaned-content detection with
ownership-claim procedures. Detection/audit is autonomous; **any outbound
contact is human-approval-gated**.

## Per-step data-source feasibility

| Platform | Feasibility |
| --- | --- |
| YouTube | Official API via connector + `analyzePackaging` signals |
| VEVO | No public API — evidence pack / manual only |
| Spotify | Official API only (no scraping; ToS/ban risk) |
| Apple Music | Official API only (no scraping) |
| TikTok / SoundCloud | Best-effort; impostor scan overlaps identity-disambiguation track — link, don't duplicate |

## Guardrails

- Distributor contact roster stays in **gbrain private storage** (slug reference
  only) — never in this file or the public repo.
- Impostor-profile scanning shares surface with identity-disambiguation work;
  this playbook owns catalog/orphan audit, not a second monitoring product.
