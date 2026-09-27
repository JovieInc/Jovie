# LYB MVP cut line

**Contract version:** `lyb-mvp-cut-line:v1`
**Source issue:** JOV-6067
**Parent governor:** JOV-6065 (LYB 30-day $5k MRR objective governor — all launch
work ranks against it)
**Tied offer:** JOV-6066 (one ICP, one paid outcome, one price — this cut line
serves that offer; it does not redefine it)
**Downstream contracts:** JOV-6069 (activation/retention), JOV-6071 (launch
surface), JOV-6073 (health trust boundary), JOV-6074 (design-partner loop)

The MVP is the smallest product that can earn and retain paid users inside the
30-day governor window. Every launch feature below carries a causal link to
purchase, activation, retention, or a required safety invariant. Anything
without that link is deferred and cannot consume launch capacity without
objective-governor override evidence (JOV-6065).

## Locks this cut line respects

- LYB is web landing-only plus iOS + Neon. No Android, no second surface.
- The coach is powered-by-Jovie; Eve/Photon are not stolen for voice, gateway,
  or inbox UI (JOV-5868 is Done — Summer live gate clear).
- Design uses optical-grid + atoms.
- Summer governor stays in force; taste, spend, legal, and credentials remain
  Tim's.
- Ops writes no product code.
- No `golden-path-lock:*`; this is not the P0 golden path.

## Must ship (launch feature → causal link)

| # | Launch feature | Causal link |
|---|---|---|
| 1 | **Opinionated coach loop** — the coach gives one directive at a time and adapts it, rather than offering a menu of options. | **Purchase + retention.** The paid outcome JOV-6066 prices is "a coach that tells me what to do," not a tracker. The opinionated loop is the product being sold and the reason to return. |
| 2 | **Isolated health memory** — per-user health context stored and scoped for LYB only, never blended into other Jovie data or other users. | **Safety invariant + retention.** Coaching quality depends on remembered context; health data isolation is a non-negotiable trust boundary (JOV-6073). Cannot be retrofit after launch. |
| 3 | **DEXA / body-composition workflow** — intake, storage, and coaching-visible interpretation of DEXA or equivalent body-comp data. | **Purchase + retention.** This is the measurable outcome anchor for the ICP: the paid promise is a body-composition result, and DEXA is the objective yardstick that makes progress legible and worth paying for. |
| 4 | **GLP-1-aware coaching boundaries** — where a user is on a GLP-1 (or similar), the coach adjusts recommendations and stays inside explicit safety rails rather than generic hypertrophy advice. | **Safety invariant + purchase.** A material share of the launch ICP is GLP-1-adjacent; wrong advice here is a health-trust breach, not a UX bug. Required by the trust boundary in JOV-6073. |
| 5 | **Progress / history context** — the coach and the user can see what was prescribed, what was done, and what changed. | **Activation + retention.** Without history the coach restarts every session, first value never lands, and there is no visible streak or trend to return for. |
| 6 | **Basic training / nutrition / check-in adjustment loop** — periodic check-in (daily or weekly cadence) that reads adherence and adjusts the plan. | **Retention.** This is the repeat-value engine: the reason a paid user comes back is that the plan changes based on what they actually did. Feeds the JOV-6069 retention contract. |
| 7 | **Reliable daily / weekly return surface** — one dependable place the user returns to for today's directive and check-in. No novelty, no breadth. | **Retention.** Repeat value requires a habitual surface; a flaky or fragmented return path silently kills the 30-day retention the governor measures. |
| 8 | **One landing page, one demo, one checkout path** — a single way to understand the offer and pay. | **Purchase.** Defined fully by JOV-6071; listed here because the MVP is not demoable end-to-end without a paid account path. |

## Deferred (cannot consume launch capacity without governor override)

Each deferral is recorded as **Ship now / Re-evaluate when / Then**, so deferred
work re-enters only on evidence, not enthusiasm.

| Deferred item | Re-entry condition |
|---|---|
| **AirPods-first / live personal-trainer interface** (JOV-5961 vision) | Ship now: nothing. Re-evaluate when: design-partner loop (JOV-6074) shows launch customers churn or refuse to pay *because* live/audio coaching is absent. Then: scope the smallest live-coaching spike behind the governor. |
| **JOV-5961 Eve aesthetic hypertrophy coach vision, wholesale** | Ship now: only the coach-loop slice in must-ship #1/#6. Re-evaluate when: retention evidence shows the simple coach loop is the binding constraint. Then: expand coaching depth against JOV-6065 ranking. |
| **Voice / realtime trainer UX on Eve or Photon** | Ship now: nothing. Re-evaluate when: same evidence bar as AirPods-first. Then: separate proposal; JOV-5868 forbids stealing Eve/Photon for this at launch. |
| **Second MVP stream or parallel surface** | Ship now: nothing. Re-evaluate when: never inside the 30-day window — JOV-6065 children are the only launch scope. Then: post-window governor review. |
| **Additional platforms (Android, desktop app, wearables beyond read-only sync)** | Ship now: nothing. Re-evaluate when: paid users demonstrably cannot complete the check-in loop on web + iOS. Then: ranked against MRR governor like any other work. |
| **Advanced coaching breadth (multi-program, exercise libraries, meal plans beyond the directive loop)** | Ship now: basic loop only. Re-evaluate when: churn interviews attribute loss to missing breadth, not missing quality. Then: expand inside the same coach loop, not as a new surface. |
| **Social / community / sharing features** | Ship now: nothing. Re-evaluate when: retention is proven and acquisition is the binding constraint. Then: ranked post-window. |

## Founder and manual operations

Founder/manual ops are allowed where they accelerate learning without violating
safety or trust. Permitted: manually onboarding design partners, hand-reviewing
check-ins, human-authored coaching adjustments behind the powered-by-Jovie
surface, manual DEXA intake. Not permitted: manual handling that bypasses the
health-memory isolation or GLP-1 safety boundaries, unreviewed automated health
advice, or ops work that writes product code.

## End-to-end demo bar

The MVP is demoable when one real user on a paid account can: land on the single
launch page, check out, complete onboarding into the coach loop, submit DEXA /
body-comp data, receive an opinionated directive, check in, and return to see
adjusted coaching with progress history — with GLP-1 boundaries visibly held
where applicable. Founder-run steps behind the scenes count toward the demo;
broken safety boundaries do not.

## Notes on evidence

Linear and gbrain were unreachable when this contract was drafted
(`linear-unavailable`, `gbrain-unavailable`); the offer specifics from JOV-6066
(ICP, paid outcome, price) are referenced, not restated, so this document does
not freeze a stale copy. If the locked offer differs from the assumptions above,
the must-ship table is re-ranked, not expanded.
