# Investor Memo

**Company:** Jovie

**Stage:** MVP built; incorporated; $25K angel committed

**Mission:** Turn creator traffic into compounding fan relationships and revenue.

## Problem

> Producing high-quality music went from something that required access to a recording studio to something any teenager with a laptop could do.
>
> But 10x more accessibility to tools didn't mean it was 10x easier to be a commercially successful musician. The hard part is elsewhere.
>
> — [Dalton Caldwell (@daltonc), December 3, 2025](https://x.com/daltonc/status/1996262592915128783)

Music creation is easier than ever, but attention and monetization are harder than ever. Creators drive traffic to a static link-in-bio page that treats every fan the same, then rely on occasional email/SMS blasts that quickly lose engagement. The result: low subscriber capture, weak conversion to merch/tickets, and no systematic way to identify and cultivate high-value fans.

## Solution

Jovie is an AI growth engine for music creators. It turns a creator's link in bio into a personalized funnel that identifies high-value fans and routes each visitor to the next best action—streaming, subscribing, merch, or tickets—then follows up automatically to increase lifetime value.

**Product:** AI flywheel for fan value extraction

Jovie runs an always-on decision loop on every profile view:

1. **Identify the fan** (best available): known user, captured email/SMS, or anonymous device/browser + coarse geo.
2. **Read fan state**: subscription status, preferred listen platform, recency/actions, geo/tour relevance, and propensity signals.
3. **Decide next best action**: pick 1 Primary CTA + 1–2 secondary CTAs based on objective.
4. **Measure outcomes**: impressions → clicks → conversions → downstream value events.
5. **Learn**: experiments and segmentation improve decisions over time.

### MVP decisioning (shippable now)

- **Identity definition:** "Subscribed/identified" = any captured identifier (email, SMS, login, etc.).
- **Primary objective (MVP):** maximize identified users (grow reachable audience), then optimize downstream value.
- If not identified → Primary = Subscribe/Capture, Secondary = Listen.
- If identified → Primary = Listen, Secondary = merch/tour/updates based on context.
- **Cross-artist personalization:** once a fan clicks Spotify anywhere, set preferred_listen_platform = spotify.
- **Listen routing rule:** if preferred_listen_platform = spotify, route to Spotify by default (edge case: rare platform switch; defer for v1).
- **Automation starter (experiment):** Spotify click → 7-minute delayed playlist message (email/SMS) to turn one stream into many.

## Why now

The bottleneck in music is no longer creation—it's attention, conversion, and monetization.

- The supply of new music is exploding. Spotify itself has cited 60,000+ new tracks uploaded per day (~22M/year).
- Across streaming, the flood is even larger. Industry reporting based on Luminate data indicates ~99,000 tracks per day were uploaded to streaming services in 2024, with massive long-tail content that never finds an audience.
- Generative AI is accelerating the firehose. Deezer reports receiving 50,000+ fully AI-generated tracks per day, representing ~34% of total daily deliveries.

As content volume rises, a static link page and occasional broadcast messages stop working. Jovie sits at the universal traffic choke point (link in bio) and turns each visit into a personalized, measurable funnel that compounds identity capture and downstream value.

## Differentiation

- Personalization at the first touchpoint (not just the inbox).
- Anonymous traffic becomes retargetable, then identifiable via smart capture moments.
- Experimentation baked in: decide → show → measure → learn.
- Cross-artist learning: intent archetypes travel with the fan (streamer vs ticket buyer vs merch buyer).

## What we measure

Early, measurable KPIs:

- **Capture rate:** profile views → email/SMS signup
- **Activation rate (24h):** captured → meaningful action (listen/follow/save/tour intent)
- **Value events per fan/week:** streaming clicks + follow/save + ticket/merch intent

We use a simple value ladder (weighted events) before full purchase attribution is available.

## Roadmap

### Phase 1: Deterministic personalization + identification

- Subscribe/Capture vs Listen primary CTA (objective: identified users)
- Remember preferred listen platform (Spotify-first rule)
- Event tracking + dashboards (capture + activation)
- Playlist follow-up experiment (7-minute delay)

### Phase 2: Retargeting + offers (Meta-first)

- City relevance (tour radius)
- Rules-based propensities (stream/ticket/merch)
- Retargeting via Meta (IG/FB): audience building + frequency caps
- Offer ladder with 2–3 creatives per offer + basic A/B tests

### Phase 3: Automation + learning

- Multi-step journeys (playlist → follow-up)
- Preference capture ("what do you want?")
- Safer dynamic creative via templates + guardrails
- Ads optimization based on predicted value

## Offer Inventory (MVP)

Creators provide initial offers; Jovie makes them actionable:

- **Flash merch sale:** creator supplies a Shopify link with a discount code (manual setup for v1; Shopify integration later).
- **Playlist offer:**
  - v1 options: creator submits a playlist, Jovie references Spotify's auto-generated "This Is {Artist}", or Jovie generates a playlist.
  - Strategy: publish playlists under a Jovie Spotify account to build a compounding playlist ecosystem and defensible distribution.
  - Longer-term: "creative AI playlists" with 70%+ artist tracks mixed with complementary songs.

## Go-to-market

- Start with artists already driving meaningful traffic (indie + manager-led rosters).
- Onboard quickly (link swap + pixel + capture widget) → prove lift in 2–4 weeks.
- Expand via manager referrals and creator communities.

## Founder

Tim is a creator + operator:

- Drove 90M+ streams to his own music
- Signed to Armada and Universal
- Spent 3 years at Bravo building marketing experiences for major artists and brands

## Funding

- **Raising:** Angel round (terms TBD)
- **Committed:** $25K angel check
- **Use of funds:** ship MVP decisioning + instrumentation, run pilot cohort, build retargeting + messaging loops, and validate repeatable GTM.

## Near-term milestones (60–90 days)

- Launch pilot cohort and publish baseline → lift metrics (capture + activation)
- Demonstrate cross-artist personalization impact (Spotify rule)
- Validate 1–2 automation plays (playlist follow-up; tour/merch capture offer)
- Define pricing from observed ROI and willingness-to-pay
