---
thesis_id: STRAT-2026-09-03-01
status: active
effective: 2026-09-03
confidence: founder-direction
source: Tim White, 2026-09-03 ~11:36 PT, JOV-5891
supersedes: []
---

# APIs/MCPs are a core Jovie line, not first

Distilled from [JOV-5891](https://linear.app/jovie/issue/JOV-5891), recorded in
repo canon on October 15, 2026. This is a product priority and acceptance
contract, not a claim of deployed capability or a live dogfood PASS.

## Decision

**EVENT:** APIs/MCPs are a core product line and a big part of what Jovie does.
The first priority remains `youtube-artist-closed-loop-mvp-v1`
([JOV-5881](https://linear.app/jovie/issue/JOV-5881)) for music artists who
regularly upload to YouTube. The homepage stays person-first “Find me”, not
waitlist-first or API-docs-first.

Agents call Jovie to connect a YouTube channel, optimize titles, descriptions,
and thumbnails, and insert Jovie links. These are access paths to the same
artist loop. Use official APIs only and preserve the existing Connect,
approval, and publication boundaries. This lock grants no new execution
authority.

## Continue the existing workstream

| Issue | Responsibility |
|---|---|
| [JOV-4073](https://linear.app/jovie/issue/JOV-4073) | Agent-native Jovie: agents as first-class users of the artist outcome. |
| [JOV-4074](https://linear.app/jovie/issue/JOV-4074) | MCP action tools over the shared agent surface. |
| [JOV-4075](https://linear.app/jovie/issue/JOV-4075) | Public API and CLI over that surface, with the same contract as MCP. |
| [JOV-4078](https://linear.app/jovie/issue/JOV-4078) | Distribution through assistant connector directories for the proven workflow. |
| [JOV-5883](https://linear.app/jovie/issue/JOV-5883) | Tim-channel YouTube optimization dogfood via Jovie MCP/CLI. |

Do not fork this into a parallel API product or backlog. Sume is the GTM
analog (MCP from Pro), not the ICP analog. Do not copy its phone farm or
replace the regularly uploading music-artist customer. The analogy does not
set a new price or entitlement. No spend. No outbound. No second SKU.

## Falsifiable experiment

**Ship now:** record this priority and use JOV-5883 for one Tim-channel
YouTube optimization through Jovie MCP/CLI until dogfood PASS. The path is
channel input → three free thumbnail before/after pairs → Connect-authorized
title/description optimization and Jovie-link insertion → result receipt.
It must run without the GUI and through official APIs only.

**Re-evaluate when:** the run produces its receipt or encounters a step that
requires the GUI. **Then:** accept the API/MCP line as demonstrated only with
a PASS receipt covering that same loop. A blocked or failed run, a manual GUI
walkthrough, mocked tests, or the presence of source code is not PASS. If it
cannot run without the GUI, the API/MCP line is not real; repair the existing
workstream rather than start another one.

The existing [experiment contract](../../../apps/web/lib/acquisition/youtube-closed-loop.ts)
and [dogfood runner](../../../apps/web/lib/acquisition/youtube-closed-loop-dogfood.ts)
are implementation evidence only. They preserve the thumbnail publication
guardrail: `thumbnails.set` remains denied; live thumbnail experiments use the
native YouTube experiment path. This lock does not enable thumbnail publishing,
ads, outbound, or additional spend, even after dogfood PASS.

The later [outcome-selling thesis](2026-10-02-sell-outcomes-replaceable-substrate.md)
applies alongside this lock: sell the creator outcome and keep orchestration
internal. API/MCP access does not make a replaceable execution substrate the
product identity.
