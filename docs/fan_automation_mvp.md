# Fan Automation MVP (Profile Conversion + Follow-ups)

_Last updated: 2025-12-14_

## Goal

Build dynamic artist profile pages that maximize **identified users** (email/SMS captured), then use lightweight automation to increase fan value.

This document is the single source of truth for:

- MVP decision rules for profile CTAs (subscribe vs listen)
- Global suppression rules (cross-artist, cross-channel)
- Event taxonomy + evaluation ("evals")
- Automation v1 (email follow-ups)
- Data model principles for music + assets (Spotify-only MVP; ISRC/MusicBrainz later)

## Non-goals (MVP)

- Fully automated creative generation
- ML-based "next best action" prediction
- SMS outbound automation (capture exists; outbound can be added after email)
- Full multi-platform discography reconciliation

## Definitions

- **Identified user**: any durable identifier captured (email, phone, authenticated user).
- **Anonymous user**: no durable identifier captured yet.
- **Global suppression**: a fan is suppressed across **all artists** and **all channels** when required.

---

# 1) MVP Profile Decisioning

## Primary objective

Maximize **identified users / unique visitors**.

## Primary Action Rules (MVP)

On every artist profile view, compute a primary action:

- If the visitor is **not identified**:
  - Primary: **Subscribe** (minimal subscribe button)
  - Secondary: **Listen**
- If the visitor **is identified**:
  - Primary: **Listen**
  - Secondary: optional, later (merch/tickets)

## Preferred Listen Platform (Spotify-first)

If a visitor clicks Spotify on any profile:

- Persist `preferred_listen_platform = spotify`.
- For all future artist pages, route the primary listen action to Spotify when available.

Edge case (deferred): users switching platforms. Provide a small escape hatch later (e.g. settings), but do not optimize for this in MVP.

---

# 2) Subscribe Offer / Messaging (MVP)

Keep subscribe minimal, with rotatable messaging.

## Initial offer theme

- "Be the first to hear new music" (and close variants)

## Copy variants

Maintain 2–4 variants. Each profile view should assign one stable variant (sticky for a period) to enable clean evaluation.

---

# 3) Automation v1: Email Follow-up

## Trigger

- When a visitor clicks **Listen on Spotify** for an artist.

## Behavior

- If identified AND not suppressed:
  - Send an email **7 minutes later** with a playlist/track set.
- If not identified:
  - No email send (capture not available). Log the event for future experiments.

## Playlist source (MVP)

- Default to Spotify “This Is {Artist}” if available.
- If later we add artist-provided playlists, prefer artist-provided.

---

# 4) Global Suppression (Cross-Artist)

## Why

Deliverability and trust. Complaints and unsubscribes must suppress sends across the entire product, not per-artist.

## Suppression rules

A suppressed fan must not receive outbound messages for any artist.

### Manual suppression

Admin must be able to:

- Add a fan identifier to suppression
- Remove a fan identifier from suppression
- Record reason and notes

### Automatic suppression

- Unsubscribes: must always suppress (email channel)
- Phase 2 (post-MVP): ingest complaint/bounce signals from the email provider and suppress automatically

---

# 5) Event Taxonomy (for Evals)

The MVP must log the following events with stable identifiers.

## Core events

- `profile_view`
  - artist id
  - anonymous id
  - identified id (if known)
  - source/referrer (coarse)
- `subscribe_impression`
  - variant id
  - placement
- `subscribe_click`
  - variant id
- `subscribe_complete`
  - channel (email/sms)
- `listen_click`
  - platform (spotify)
- `followup_email_scheduled`
- `followup_email_sent`
- `followup_email_click`

## Evaluation metrics

Primary:

- `identified_users / unique_visitors` (by artist, by source)

Secondary:

- Subscribe funnel:
  - `subscribe_click / subscribe_impression`
  - `subscribe_complete / unique_visitors`
- Email automation:
  - `followup_email_click / followup_email_sent`

---

# 6) Build Plan (Order of Work)

This ordering optimizes for shipping fast while keeping evals clean.

## Step 1 — Identity + Preference + Decisioning

- Anonymous identity persistence
- Identity stitching when capture occurs
- Spotify preference persistence
- Server-side primary action selection

**Eval:** profile renders correct CTA state immediately; Spotify preference holds across artists.

## Step 2 — Event logging baseline

- Emit the core event taxonomy
- Create a minimal dashboard/report for `identified_users / unique_visitors`

**Eval:** events are consistent; metrics can be computed per artist/source.

## Step 3 — Email follow-up automation

- Schedule send at +7 minutes after Spotify click
- Enforce suppression before send

**Eval:** delivery works end-to-end; click-through is measurable.

## Step 4 — Global suppression v1

- Admin-managed suppression list
- Unsubscribe suppression

**Eval:** suppressed recipients never receive follow-ups.

## Step 5 — Copy rotation experiments

- 2–4 subscribe variants
- Sticky assignment
- Variant-level reporting

**Eval:** detect a statistically meaningful lift (or confidently prune losers).

## Step 6 — Meta retargeting v1 (post baseline)

- Audience: viewed-but-not-identified
- Suppress: identified users
- Frequency caps

**Eval:** incremental lift in identification without harming unsubscribes/complaints.

---

# 7) Music Data Model Principles (Spotify-only MVP; ISRC/MusicBrainz later)

## MVP scope

- Spotify-only discography ingestion (later milestone)

## Long-term alignment

Design canonical entities to be compatible with MusicBrainz-style modeling:

- Artist
- Release
- Recording
- External platform mapping records

Store fields now where possible (nullable), so we can later attach:

- ISRC(s) to recordings
- MusicBrainz IDs (MBIDs) for artist/release/recording

## Refresh workflows (future)

- Manual refresh to ingest new releases
- Manual refresh to search for missing matches
- Data quality issue surfacing (wrong artist assignment, duplicates, typos)

---

# 8) Creative Assets (Default allow; quick disable)

Default behavior:

- Imported assets are eligible by default.
- Admin can disable an image quickly.

Future: track performance per asset id and rotate creatives in ads/emails.
