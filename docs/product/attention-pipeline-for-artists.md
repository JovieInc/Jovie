# Attention pipeline for artists

Status: Brief, not in build (inherits [`canon/PRODUCT.md`](../../canon/PRODUCT.md))
Owner: Tim White
Last updated: 2026-09-27

## Summary

Jovie starts with identity: an artist's profile, smart links, and the fans
they can reach again. The next outcome is attention to that identity. Jovie is
building the attention pipeline for itself first: find what artists ask, answer
it with certified content, publish it, and measure it. If it works for Jovie,
the same pipeline can run for an artist, with their fans' questions as the
input and their channels as the output.

This brief records the direction. Nothing artist-facing is in build.

## What exists (phase 1, internal)

- **Certification.** Every public jov.ie page gets SEO, agent-readiness, and
  copy receipts ([SEO certification](../marketing/SEO_CERTIFICATION.md)).
- **Question map.** A ranked, capped map of what artists ask on Google,
  Reddit, YouTube, and TikTok, built from existing credits.
- **Content primitive.** Idea, then script, then launch
  ([answer-content pipeline](../marketing/ANSWER_CONTENT_PIPELINE.md)). Ideas
  reach Tim as Ovie cards, three a day at most. The blog is the only launch
  target. The schema uses the BubblegumFactory CONTENT.md vocabulary (formats,
  pillars, characters) so audio, video, and social channels can plug in later.

## The artist product, later

Same loop, pointed at one artist:

1. **Identity.** The artist's Jovie profile and catalog.
2. **Question map.** What their fans and their genre ask: comments on their
   videos, threads about their releases, searches around their name.
3. **Ideas.** A short list in the artist's inbox, never a dashboard of knobs.
4. **Scripts and launches.** Written in the artist's voice (`customer-voice`
   register), certified, and launched to the channels they already use.
5. **Measure and re-rank.** What moved streams, profile visits, and fans
   reached again goes back into the map.

Product canon applies (canon/PRODUCT.md, "outcomes over knobs"): the artist
states the outcome and Jovie does the work. No model picker, no per-channel
settings grid, and no pipeline internals on screen. Configurability waits for
three distinct paying Pro asks.

## Hypothesis: GTM for the entertainment industry (unvalidated)

If Jovie can reliably turn an identity into attention, it could become the
go-to-market layer for entertainment: labels, managers, and artists hand Jovie
a release and get demand back. This is a hypothesis. No customer has asked for
it, and no Jovie-run content has measured traffic yet.

**Cheapest validation step:** run the internal pipeline for 30 days on the
blog alone. Measure clicks and impressions per published answer (Google Search
Console, once the Summer observability worker connects it) and profile
sign-ups attributed to answer pages. Then run it once by hand for three
friendly artists, one release each, and count the ones who ask to keep it.

| Field | Answer |
|---|---|
| Current bottleneck | Right-fit artists do not know Jovie exists (marketing ladder step 1) |
| Customer evidence | Question map: artists ask about smart links, release plans, and fan lists on every platform, and forums own many of the answers |
| Metric to improve | Organic sessions to answer pages, then sign-ups from them |
| Expected improvement | Unknown until GSC is connected; measure first |
| Smallest reversible change | Blog answer articles through the certified pipeline |
| Verification receipt | Nightly SEO certification artifact plus GSC per-page clicks |
| Rollback | Unpublish the posts; the pipeline is internal tooling |

**Ship now:** the internal loop, blog only.
**Re-evaluate when:** 10 answer articles have 30 days of GSC data.
**Then:** decide whether a second channel or the three-artist manual pilot is next.

## Parked: creator data as a product

Hypothesis, not in scope: cache the creator and music data Jovie already
collects in its own database and serve it to agents over MCP for a fee,
possibly as a provider inside an agent web-data marketplace, in the style of
existing music analytics and social-stats data providers. It needs a data
licensing review, a demand signal from agent builders, and a cost model before
it earns a build slot. Revisit after the attention pipeline shows traction.
