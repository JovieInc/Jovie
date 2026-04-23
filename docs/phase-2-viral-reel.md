# Phase 2: Viral Reel Generator (MVP)

Branch: `itstimwhite/phase-2-viral-reel`
Phase 1 PR: #7548 (canonical catalog + Smart Plan wizard; in review)

## Context

Phase 2 of the release-plan roadmap. Per the autoplan consensus, the Content
Engine is the differentiator. Ship one killer skill first — a viral-formatted
reel generator — resist feature sprawl, prove quality before expanding.

## Decisions (user, 2026-04-22)

- **Shape:** Silent cover-teaser reel (no baked audio — user adds song natively on TikTok/IG when posting). Licensing-safe, industry-standard pattern.
- **Video stack:** Remotion + Remotion Lambda (React-based, fits stack).
- **Audio source (deferred):** later phases use Music Fetch `previewUrl`; disable if no audio for the record.
- **MVP scope:** 1 format (simplest), not 3.
- **Ship gate:** feature flag. Admin/own-account only until quality is proven.

## MVP scope — "Release teaser reel v1"

One template. 9:16 vertical, 6-8 seconds, silent MP4 (H.264, 30fps):

- Cover art, center-cropped, animated zoom-in
- Artist name (bottom, bold sans)
- Release title (below artist, slightly smaller)
- "Out Friday" / "Out Now" chip (date-aware)
- Jovie watermark, subtle, bottom corner
- Soft fade in/out + a single animation accent (waveform bar or subtle particles)

The user downloads the MP4, adds the track from TikTok/IG's native library, posts.

## Architecture

```
┌──────────────────────────────────┐
│ User clicks "Generate reel"      │  (gated: VIRAL_REEL_MVP flag)
│ from release detail page         │
└───────────────┬──────────────────┘
                ▼
┌──────────────────────────────────┐
│ POST /api/reels/generate         │  server action
│ validates entitlement + release  │
│ inserts reel_jobs row (queued)   │
└───────────────┬──────────────────┘
                ▼
┌──────────────────────────────────┐
│ /api/cron/process-reel-jobs      │  (Vercel Cron every 1m, maxDuration 300s)
│ claims job → calls Remotion      │
│ Lambda → uploads MP4 to Vercel   │
│ Blob → updates reel_jobs row     │
└───────────────┬──────────────────┘
                ▼
┌──────────────────────────────────┐
│ Frontend polls reel_jobs status  │
│ shows preview + download button  │
└──────────────────────────────────┘
```

## Schema (new)

```sql
reel_jobs
  id uuid pk
  creator_profile_id fk
  release_id fk
  template_slug text          -- 'teaser-v1' for MVP
  status enum (queued | rendering | succeeded | failed)
  error text nullable
  output_url text nullable    -- Vercel Blob URL
  duration_ms int nullable
  template_inputs jsonb       -- {artistName, releaseTitle, releaseDate, artworkUrl, watermark}
  started_at ts
  completed_at ts
  created_at ts
```

## Feature flag

`VIRAL_REEL_MVP` — added to `APP_FLAG_DEFAULTS` / `APP_FLAG_KEYS`. Default
`false`. Enabled via Statsig rule targeting specific user IDs (Tim's account
first, then internal testers).

## Stack

- **Remotion** — React composition framework
- **Remotion Lambda** — managed AWS render
  - Alternative if AWS setup is friction: start with Remotion rendered in a
    Vercel serverless function (works for short/simple compositions under 300s)
- **Vercel Blob** — MP4 storage (existing pattern)
- **Vercel Cron** — async job processor (existing pattern)
- **Statsig** — flag gating (existing pattern)

## Phased execution

1. **Flag + schema** — register `VIRAL_REEL_MVP`, add `reel_jobs` table + migration.
2. **Remotion composition** — single 9:16 teaser template component + types for inputs.
3. **Lambda wiring** — Remotion Lambda deploy (or Vercel fn render for simplicity); render action accepts `template_inputs`, returns MP4 buffer.
4. **Server action + cron processor** — queue job; cron processes pending jobs.
5. **UI** — "Generate reel" button on release detail (flag-gated) + status polling + download link.
6. **Tests** — composition snapshot test, server-action unit test, cron handler unit test.
7. **/qa + /review + /ship** — Phase 2 gate.

## Non-goals (follow-up phases)

- Multiple templates (lyric-hook, visualizer-hook, static-hook variants)
- Audio-baked reels using `previewUrl`
- Direct posting integrations (TikTok / IG API)
- User audio uploads
- A/B template testing
- Customizable text / fonts / colors per-artist

## Verification

- Flag off → button hidden, server action rejects.
- Flag on → generating a reel produces a downloadable 9:16 MP4 in <60s.
- Reel metadata matches release (artist name, title, artwork).
- Re-running on the same release does not create duplicate jobs in <5 minutes (idempotent).

## Risks / tradeoffs

- **Remotion Lambda setup** requires AWS creds. If that's blocked, fall back to Remotion rendering inside a Vercel serverless fn (works for this scope; 300s is plenty for 6-10s compositions).
- **Quality bar is subjective.** Plan to iterate 2-3 times on the template before widening the flag.
- **No audio in MVP** means users see the generator as one step (render) and then another step (post with music). That's fine — matches how creators already work.
