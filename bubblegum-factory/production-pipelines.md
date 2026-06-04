---
type: reference
title: PRODUCTION PIPELINES — Tools & Workflows
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-01T04:41:46.991Z'
source_kind: 'mcp:put_page'
tags:
  - bubblegum-factory
  - pipeline
  - post-production
  - production
  - tools
  - workflow
---

# Production Pipelines — Tools & Workflows

## Image Generation

### Recommended Tools

| Tool | Best For | Notes |
|------|----------|-------|
| Midjourney v6+ | High-quality architectural renders | Best overall quality for environments |
| DALL-E 3 | Quick iteration, integrated | Good for fast tests |
| Flux Pro | Photorealistic detail | Great for materials and lighting |
| Stable Diffusion XL | Fine-tuned control | Use with custom LoRAs for consistency |
| Runway Gen-3 | Video generation | For animated/panning shots |
| Kling AI | Video from images | Strong motion on stills |
| Sora | Premium video | When available, best motion |

### Workflow
1. Start with PROMPTS.md prompt (prepend Master Style Block + append Text instruction)
2. Generate 4+ variations
3. Select best composition
4. Upscale / enhance if needed
5. Save to `assets/renders/{room}/` with canonical naming
6. Log in ASSETS.md

### Consistency Tips
- Use the same seed when iterating
- Reference images: supply podcast room design image as style reference
- Always include the Master Style Block
- Always append the Text/Logo instruction
- Use the Style Guardrail when outputs drift

## Video Generation

### From Still Images (Phase 1)
1. Generate high-res still image
2. Import to Runway / Kling / Sora
3. Apply Ken Burns (slow zoom/pan)
4. Add subtle motion (breathing room, light flicker)
5. Export vertical 9:16 for social

### Talking Head Video
1. Supply reference photos of Tim
2. Use talking-head prompt from PROMPTS.md
3. Generate video directly (Runway, Kling, HeyGen, etc.)
4. Sync mouth movement with ElevenLabs audio

## Audio

### Voice (Virtual Tim)
- **Tool**: ElevenLabs
- **Voice ID**: `zccsmWaGLwJMUej5i4Xq`
- Clone Tim's voice from reference recordings
- Match cadence, tone, and vocal patterns
- Always sound conversational, never robotic

### Sound Design
- Subtle ambient factory hum (clean, precise, satisfying)
- No music podcasts unless artist/song-related
- Transitions: subtle whoosh or white noise sweep

## Post-Production

### Tool Options

| Tool | Best For |
|------|----------|
| CapCut | Fast social media editing, auto-captions |
| Premiere Pro | Full control, professional output |
| After Effects | Motion graphics, compositing |
| Figma | Static posts, thumbnails |
| DaVinci Resolve | Color grading (free + powerful) |

### Non-Negotiable Rules
1. **All text in post** — never generated in AI
2. **All logos in post** — composite in Figma/Premiere
3. **All captions in post** — CapCut auto-caption + manual fix
4. **Consistent branding** — use the Brand Guidelines document
5. **Export specs**:
   - TikTok/Reels: 9:16 (1080x1920), H.264, 30fps
   - YouTube Shorts: 9:16 (1080x1920), H.264, 30fps
   - YouTube: 16:9 (1920x1080), H.264, 30fps
   - Instagram Feed: 1:1 or 4:5 (1080x1080 or 1080x1350)

## Content Pipeline (Per Clip)

```
1. Script (30-90s of dialogue)
2. Generate image (use PROMPTS.md prompt)
3. Generate voice (ElevenLabs)
4. Generate motion (Runway/Kling on still image)
5. Composite in CapCut/Premiere
6. Add captions (CapCut auto + manual)
7. Add text overlay (tim.white / topic / CTA)
8. Export 9:16 vertical
9. Upload + caption + schedule
```
