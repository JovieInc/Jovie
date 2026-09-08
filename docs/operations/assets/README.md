# Shipping HUD visual evidence

`../../screenshots/gem-symphony-hud-430x90.png` is a target-viewport render of the canonical
`scripts/symphony/gem-checkin-hud.py` implementation in PR #16858.

- Viewport: 430 columns by 90 rows
- Source: live official Symphony API on Gem at `127.0.0.1:4041`
- Captured Symphony state: 23 of 30 agents active, 277,058 tokens/second,
  11 failures, 2 queued items, and 799.7 million total tokens
- Captured host state: CPU/load 35%, memory 89% available, disk 2% available
  with 13% I/O PSI, network rate 142.5 Mbps with link saturation unknown, and
  worker slots at 77%
- Captured PR flow: 120 open now, 106 opened and 88 merged in the rolling prior
  24 hours; the bounded CI rollup collected in 9,461 ms and cached renders
  completed in under one second
- Truthfulness boundary: company and ship-receipt metrics unavailable from the
  source are shown as `UNKNOWN`, never inferred as zero
- Freshness: relative natural time; no raw timestamp is exposed in the frame
- Jovie-facing copy contains no vendor name

The still is sufficient for this non-interactive terminal HUD review because
the relevant acceptance criteria are source labeling, hierarchy, legibility,
semantic states, fixed geometry, and full-height composition. State-transition
and layout-stability behavior is exercised by the focused render tests.
