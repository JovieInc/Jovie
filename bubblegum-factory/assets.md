---
type: reference
title: ASSETS — Asset Inventory & Naming Convention
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-01T04:41:48.396Z'
source_kind: 'mcp:put_page'
tags:
  - assets
  - bubblegum-factory
  - inventory
  - naming
  - renders
---

# ASSETS.md — The Bubblegum Factory Asset Inventory

Track all generated and sourced assets here.

## Reference Assets

| File | Description | Source |
|------|-------------|--------|
| `assets/reference/podcast-room-design.png` | White circular podcast studio concept | Tim White, May 2026 |

## Naming Convention

```
BGF_SET_{room}_{version}_{shot-name}

Rooms:
  PODCAST_ROOM  ← Podcast set
  LOBBY         ← Main lobby / homepage hero
  HALLWAY       ← Millennium Falcon-style corridor
  CONTROL_ROOM  ← Recording console room
  LIVE_ROOM     ← Performance space
  ISO_BOOTH     ← Vocal booth
  MERCH         ← Products / merch details

Versions:
  v001 = First accepted design direction
  v002 = Second iteration
  ...

Shot names:
  MASTER_WIDE, TIM_CAM_A, REVERSE_CAM_B, TWO_SHOT_C,
  HERO, DETAIL, ESTABLISHING, TIGHT, ENVIRONMENT
```

## Generate Queue

### Priority 1: Podcast Room (Ship First)
- [ ] `BGF_SET_PODCAST_ROOM_v001_MASTER_WIDE` — Wide establishing shot, no people
- [ ] `BGF_SET_PODCAST_ROOM_v001_TIM_CAM_A` — Tim angle (needs reference photos)
- [ ] `BGF_SET_PODCAST_ROOM_v001_REVERSE_CAM_B` — Empty guest position
- [ ] `BGF_SET_PODCAST_ROOM_v001_TWO_SHOT_C` — Both positions, no people

### Priority 2: Lobby (Website Hero)
- [ ] `BGF_SET_LOBBY_v001_HERO` — Wide symmetrical lobby establishing
- [ ] `BGF_SET_LOBBY_v001_BAR_MERCH` — Espresso bar + merch wall detail
- [ ] `BGF_SET_BLAST_DOORS_v001` — Blast doors standalone

### Priority 3: Other Rooms
- [ ] `BGF_SET_HALLWAY_v001` — Corridor shot
- [ ] `BGF_SET_CONTROL_ROOM_v001` — Console room
- [ ] `BGF_SET_LIVE_ROOM_v001` — Live recording space
- [ ] `BGF_SET_ISO_BOOTH_v001` — Vocal booth

## Post-Production Pipeline

1. Generate base image using PROMPTS.md prompts
2. Import to CapCut / Premiere / After Effects
3. Add text overlays (never generated)
4. Sound design (subtle ambient + ElevenLabs voice)
5. Export:
   - 9:16 vertical for Shorts/Reels/TikTok
   - 16:9 horizontal for YouTube
   - Audio-only for podcast feed

## Version Control

All iteration versions are kept. The latest approved version is tagged with `_LATEST` in the filename or noted here.

| Asset | Latest Version | Date | Notes |
|-------|---------------|------|-------|
| Podcast Room | v001 | 2026-05-30 | Based on Tim's reference image |
| Lobby | — | — | Not yet generated |
| Tim Talking Head | — | — | Awaiting reference photos |
