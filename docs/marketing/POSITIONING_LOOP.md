# Positioning experiment loop

Owner: Summer (marketing lane). Source of truth: [`canon/positioning-variants.json`](../../canon/positioning-variants.json).
Meaning and message roles: [`canon/POSITIONING.md`](../../canon/POSITIONING.md) (founder-locked; this loop never changes it).

## Why

Positioning lines were retyped per surface: the application one-liner, the deck
cover, the homepage hero and bios drifted apart, and nothing measured which
framing works. Agents can generate framings cheaply. The scarce inputs are
truth, a consistent promise, and real conversion data. This loop spends the
cheap part freely and protects those three.

## The loop

```
generate N variants ──> gates (deterministic) ──> persona panel (offline)
        ^                    │ fail / pivot signal       │ top K
        │                    v                           v
        │              dropped / Tim              live A/B where traffic exists
        │                                                │ min sample + significance
        └──── next round <── decision in gbrain <── winner propagates from ONE file
```

1. **Generate.** An agent appends variants to `variants[]` with `frame`
   (concrete, familiar, wedge-vision, vision-led), `icp`, `lines` per surface
   line, a literal `mvp` statement and, if any, a `vision` statement.
2. **Gate** (`scripts/positioning/gates.mjs`, pure, unit-tested):
   - *Truth:* a line that states direction (career, OS, harness, "every
     creator", building) must carry a "today / starting with / next:" anchor;
     the `mvp` field is required. No claim-like numbers in a positioning line.
   - *Canon:* POSITIONING.md "Language to avoid", retired lines, and the
     still-pending P-2026-10-03 lines.
   - *Price:* no price wording; prices come only from `priceOwner`.
   - *Slop and brand:* `@jovie/copy` lint at the surface register; block
     findings fail. The brand line is legal, not tame: only block-severity
     rules fail.
   - *Pivot:* an `icp` outside `allowedIcps` never ranks. It is a pivot signal
     to Tim with evidence, per the pivot-signal rule.
3. **Rank offline** (`scripts/positioning/rank.mjs`): every persona sees all
   passing variants at once, shuffled and lettered, and scores each 0-10 with a
   yes/no on its own question. Investor personas come from the private
   official-guidance panel (`--panel`, never committed); buyers are the public
   buyer-eval archetypes, with the off-ICP control excluded from the vote.
   Model: routing caller `dev.evals` on the Workers AI relay. A winner must lead
   **both** panels by `WIN_MARGIN` (0.5). Otherwise the active line stays.
4. **Test live** where traffic exists, top K = 2 to 3 arms:
   - `/artist-profiles` hero and the homepage via the content-record
     `experiment` field (weighted arms, `artist_signup` funnel step), preview
     with `&arm=<id>`. Homepage arms stay audience-neutral (MKT-D16).
   - Onboarding and lifecycle email copy through Statsig experiments
     (`apps/web/lib/flags`).
   - Applications and the deck have no traffic: the offline panel is the
     only signal, and outcomes (interview / no interview) are logged as labels.
5. **Decide.** Call a live winner only after each arm reaches the minimum
   sample (default 400 visitors and 20 conversions per arm) and a one-sided
   two-proportion z-test passes (`apps/web/lib/ai/experiments/stats.ts`,
   `twoProportionZ`, z >= 1.645). No peeking verdicts before the sample.
6. **Propagate.** Set `surfaces.<id>.active`. Consumers read the active line:
   private fundraising answers and deck bind `{p:<surface>}`; the content
   record and Statsig arms reference variant ids. One edit, every surface.
7. **Record.** Each round appends one row to `canon/growth-experiments.jsonl`
   (hypothesis, variants, metric, sample, result, decision) and writes a gbrain
   page `experiments/positioning-<date>` with the rank receipt summary. Stage
   timestamps (generated, gated, ranked, live start, decided) are in the row.

## Guardrails

| Guardrail | Enforced by |
| --- | --- |
| Literal truth: MVP as it exists, vision labeled | truth gate, claims ledger for any number |
| Same price everywhere | price gate; `priceOwner` only |
| Brand line (legal, not hateful) | copy lint block rules only |
| No fake traction | number gate; traction lives in the claims ledger, never in a line |
| Minimum sample before a winner | step 5; offline needs both panels |
| Different ICP or business | pivot gate, escalated to Tim |
| Locked canon wording | Founder approval path in POSITIONING.md; this file only selects among compliant lines |

## Cost

Offline: (13 investors + 4 buyers) x samples calls per run on the Workers AI
relay (Cloudflare credits); about 34 calls at 2 samples. Runs are manual or
event-triggered (a new variant batch), never on a clock.

## Known gap

POSITIONING.md approves "AI leverage for human creators" at investor depth,
but `@jovie/copy` blocks "leverage" as a corporate verb. The gate follows the
lint, so that line cannot rank until canon or the lint rule changes.
