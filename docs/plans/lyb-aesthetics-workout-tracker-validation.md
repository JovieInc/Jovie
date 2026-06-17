# LYB Aesthetics-First Workout Tracker — RP Complaint Validation (JOV-3224 / #10966)

## Status (2026-06-16)

**Gate: VALIDATE complete — build remains blocked.**

Idea Radar card is still **PROPOSED**. Do not promote to an active cycle or file build children until Tim 👍 in `#idea-radar`. This document satisfies the issue’s required **research-before-build** step only.

## Research scope

Sources mined (2026-06-16):

| Source | What we pulled |
| --- | --- |
| App Store (iOS) | Featured + critical reviews on [RP Hypertrophy](https://apps.apple.com/us/app/rp-hypertrophy/id1555614554) |
| Google Play | Critical + positive reviews on [RP Hypertrophy Android](https://play.google.com/store/apps/details?id=com.rp.hypertrophy) |
| Ditchnet Forum | Long-form user thread: [honest RP Hypertrophy review](https://ditchnet.org/t/can-anyone-share-an-honest-rp-hypertrophy-app-review/2143) |
| Competitor synthesis | Mesostrength alternatives roundup citing App Store / Reddit / Trustpilot patterns |
| Medium (6-mo user) | [Justin James Smith — 6 months on RP](https://medium.com/@justinsmith31491/i-used-the-rp-hypertrophy-app-for-6-months-f20e67378b20) |
| Reddit (blocked direct fetch) | Thread titles surfaced via search: r/naturalbodybuilding (price), r/RPStrength (verdict), r/MyoAdapt (switching away), r/liftosaur (bugs) |

Reddit pages blocked automated fetch (network security). App Store, Play Store, Ditchnet, and third-party synthesis provided enough signal to cluster pains. YouTube comment mining was not completed in this pass — treat as a candidate follow-up if Tim wants primary-source quotes before build.

## Pricing context (verified, not fabricated)

| Plan | Price |
| --- | --- |
| Monthly (iOS IAP) | $34.99 |
| Yearly (iOS IAP) | $299.99 |
| Competitor floor (programmed) | Alpha Progression ~$9.99/mo; Hevy Pro ~$8.99/mo |

RP public MRR is not disclosed. WTP signal in the idea card is attributed to Tim (daily paying user at ~$30/mo tier), not inferred market revenue.

## Top 3 validated pains

### 1. Logging friction buried under program theater

**Evidence**

- Ditchnet users describe RP as “good engine, mediocre coach” — you must tame volume knobs, fatigue sliders, and RIR reporting or the app “feels random.”
- App Store review (wamcubs, Mar 2026): likes meso automation but frustrated hunting past work — calendar is “Monday / Week 1” not “what did I do on March 12?”
- Play Store praise still notes per-set questionnaires (“asks questions after each set”) as core to progression — power users tolerate it; switchers call it overhead.
- Multiple forum posts: too many exercises per muscle, program hopping mid-meso, overusing session-fatigue sliders.

**User ask (paraphrased):** “Let me log sets fast and see progression without debugging the app every week.”

**10x response (LYB MVP):** One screen — pick exercise → log weight × reps → auto next-session target. No mesocycle builder, no post-set pump/soreness survey, no 45-template picker for v1.

---

### 2. Aesthetic payoff is invisible — progress is logbook-first, not mirror-first

**Evidence**

- Forum consensus on “are you progressing?” reduces to: anchor-lift logbook + scale trend + **front/side pics every 2 weeks**.
- RP does not connect training load to physique timeline; users manually correlate gym logs with mirror/photos.
- Idea seed (Tim): serious aesthetics lifters want to “look great naked” — RP optimizes for mesocycle science, not visible upper-body prioritization (delts/arms/back/chest).

**User ask (paraphrased):** “Show me that my training is making me look better, not just that my logbook numbers moved.”

**10x response (LYB unfair advantage):** Overlay session summary (top sets / weekly volume for aesthetics muscles) onto LYB’s existing private photo + body-comp timeline. Optional single-line lift marker on a timeline day — no separate “fitness dashboard.”

---

### 3. Premium price without trial for complexity most users do not want

**Evidence**

- Play Store (Mar 2026): “PREMIUM ONLY… $35/month is extortionate. My gym membership is less.”
- App Store (wamcubs): “Decent — Not Worth the $” — lists scheduling rigidity and missing calendar/history as value gaps at price point.
- Mesostrength synthesis: no free tier; ~2.8 Trustpilot pattern on RP ecosystem; Reddit threads compare RP monthly cost to gym membership.
- Medium 6-mo user: accepts $35/mo because hypertrophy is primary hobby — acknowledges “pricier fitness apps” and non-beginner audience.

**User ask (paraphrased):** “I’ll pay if it’s obviously better for my goal — not if I pay first to learn a mesocycle UI.”

**10x response:** Ship thinnest logger first inside LYB sibling (reuse auth/paywall/timeline). Curated aesthetics-first exercise list — not 250-video encyclopedia. Price at or below RP with clearer aesthetic ROI story.

## Secondary pains (not top-3, but inform MVP cuts)

| Pain | MVP cut |
| --- | --- |
| Black-box auto-volume swings | Replace with transparent double-progression suggestion (“add 2.5 lb when you hit 3×10”) |
| No offline mode | Defer — note for LYB module if gym dead zones are common in ICP interviews |
| Steep beginner curve | Out of scope — ICP is serious aesthetics lifters, not novices |
| Missing muscle granularity (e.g. delt heads) | v2 — v1 uses aesthetics-weighted groups (delts, arms, back, chest; legs optional) |
| Bugs / layout issues (v1.0.x changelog) | Not differentiated — table stakes for any ship |

## What people praise (do not break)

- **Logbook + progression memory** — multi-year users stay for set/rep history and “set it and forget it” programming.
- **Science credibility** — Dr. Mike brand matters; LYB should not anti-position on science, only on bloat.
- **Exercise swap mid-session** — keep flexibility; drop template ceremony.

## MVP spec (unchanged from idea card, now research-backed)

```
Screen 1 only (v1):
  1. Pick exercise (curated aesthetics-first list)
  2. Log sets (weight × reps)
  3. See next-session target (auto progressive overload)

Explicitly OUT for v1:
  - Mesocycle / periodization UI
  - Post-set pump/soreness/fatigue surveys
  - Rest timers, circuits, ice baths, cardio logging
  - 45+ program templates

LYB tie-in (v1 optional):
  - One timeline annotation line on existing photo/body-comp day
```

### Curated aesthetics-first exercise seed (v1 list, ~20 movements)

| Group | Exercises |
| --- | --- |
| Delts | Cable lateral raise, DB shoulder press, rear-delt fly |
| Arms | Incline DB curl, cable triceps pushdown, hammer curl |
| Chest | Incline DB press, machine chest press, cable fly |
| Back | Lat pulldown, chest-supported row, straight-arm pulldown |
| Legs (optional) | Hack squat or leg press, RDL, leg curl |

Progressive overload rule (v1): when all working sets hit top of rep range at same load, suggest +2.5–5 lb (upper) or +5–10 lb (lower) and reset to bottom of range.

## Standalone vs LYB module

| Option | Pros | Cons |
| --- | --- | --- |
| **LYB module (lean)** | Reuses timeline, auth, paywall, body-comp correlation | Blocks on LYB MRR proof per issue |
| **Standalone “LogYourLifts”** | Faster isolated experiment | Second app surface, no aesthetic overlay moat |

**Recommendation:** Stay with issue default — **LYB module after MRR proof**, but keep progressive-overload + exercise-list logic portable so a standalone spike remains cheap.

## Go / No-Go

| Check | Result |
| --- | --- |
| Top 3 pains confirmed from real user voice | **Pass** |
| Pains map to thin MVP without scope creep | **Pass** |
| Tim 👍 in #idea-radar | **Pending** |
| LYB proves MRR (issue gate) | **Pending** |
| YouTube comment primary-source pass | **Optional** — file candidate if Tim wants quotes |

**Verdict:** **GO to BUILD (gated)** — research step complete. Next actions are product/strategy (Tim 👍, LYB MRR), not engineering. When unblocked, decompose into one child: “One-screen aesthetics logger + overload engine” (Codex/SwiftUI per issue tag).

## Related

- Parent: JovieInc/Jovie#10354 (Idea Radar)
- Adjacent: JovieInc/Jovie#10837 (LYB peptide wedge), JovieInc/Jovie#10877 (LYB visual timeline DNA)