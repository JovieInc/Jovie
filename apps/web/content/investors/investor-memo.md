# Investor Memo

**Company:** Jovie

**Stage:** MVP built; incorporated

**Mission:** Turn creator traffic into compounding fan relationships and revenue.

## Problem

[Dalton Caldwell argued in December 2025](https://x.com/daltonc/status/1996262592915128783) that high-quality music production no longer requires recording-studio access, but easier access to tools has not made commercial success ten times easier. The hard part is elsewhere.

Music creation is easier than ever, but attention and monetization are harder than ever. Creators drive traffic to a static link-in-bio page that treats every fan the same, then rely on occasional email/SMS blasts that quickly lose engagement. The result: low subscriber capture, weak conversion to merch/tickets, and no systematic way to identify and cultivate high-value fans.

## Problems We're Solving

| Problem | Summary | Article |
|---------|---------|-----------|
| The MySpace Problem | Link-in-bio pages are cluttered and unfocused. More customization = worse conversion. | [Read →](/blog/the-myspace-problem) |
| The Friday Problem | Artists release in bursts, not rhythms. Algorithms reward consistency but most artists can't sustain it alone. | [Read →](/blog/the-friday-problem) |
| The Contact Problem | Team members change but contact points don't. Opportunities leak to stale emails artists can't see. | [Read →](/blog/the-contact-problem) |

## Solution

Jovie is an AI growth engine for music creators. It turns a creator's link in bio into a personalized funnel that identifies high-value fans and routes each visitor to the next best action, such as streaming, subscribing, merch, or tickets. Automatic follow-up helps each relationship grow over time.

For the broader operating thesis behind this loop, read [The Closed-Loop Creator Thesis](/investor-portal/closed-loop-creator).

**Product:** AI flywheel for fan value extraction

Jovie runs an always-on decision loop on every profile view:

1. **Identify the fan** (best available): known user, captured email/SMS, or anonymous device/browser + coarse geo.
2. **Read fan state**: subscription status, preferred listen platform, recency/actions, geo/tour relevance, and propensity signals.
3. **Decide next best action**: pick one Primary CTA plus one or two secondary CTAs based on objective.
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

Attention, conversion, and monetization are now the bottlenecks in music.

As content volume rises, a static link page and occasional broadcast messages stop working. Jovie sits at the universal traffic choke point (link in bio) and turns each visit into a personalized, measurable funnel that compounds identity capture and downstream value.

## Differentiation

- Personalization begins at the first touchpoint and continues in the inbox.
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
- Offer ladder with two or three creatives per offer + basic A/B tests

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
  - Strategy: publish playlists under a Jovie Spotify account to build a compounding catalog and defensible distribution.
  - Longer-term: "creative AI playlists" with 70%+ artist tracks mixed with complementary songs.

## Go-to-market

- Start with artists already driving meaningful traffic (indie + manager-led rosters).
- Onboard quickly (link swap + pixel + capture widget) → prove lift in two to four weeks.
- Expand via manager referrals and creator communities.

## Founder

Tim is a creator + operator:

- Signed to Armada and Universal
- Spent 3 years at Bravo building marketing experiences for major artists and brands

## Funding

- **Raising:** Angel round
- **Use of funds:** ship MVP decisioning + instrumentation, run pilot cohort, build retargeting + messaging loops, and validate repeatable GTM.

## Near-term milestones (60 to 90 days)

- Launch pilot cohort and publish baseline → lift metrics (capture + activation)
- Demonstrate cross-artist personalization impact (Spotify rule)
- Validate one or two automation plays (playlist follow-up; tour/merch capture offer)
- Define pricing from observed ROI and willingness-to-pay
