# Shipping HUD visual evidence

`gem-symphony-hud-430x90.png` is a target-viewport render of the canonical
`scripts/hermes/gem-checkin-hud.py` implementation in PR #16858.

- Viewport: 430 columns by 90 rows
- Source: live official OpenAI Symphony API on Gem at `127.0.0.1:4041`
- Captured state: 22 of 40 agents active, 8,386 tokens/second, 2 failures,
  1 queued item, and 185,442,093 total tokens
- Truthfulness boundary: company and ship-receipt metrics unavailable from the
  source are shown as `UNKNOWN`, never inferred as zero
- Freshness: relative natural time; no raw timestamp is exposed in the frame

The still is sufficient for this non-interactive terminal HUD review because
the relevant acceptance criteria are source labeling, hierarchy, legibility,
semantic states, fixed geometry, and full-height composition. State-transition
and layout-stability behavior is exercised by the focused render tests.
