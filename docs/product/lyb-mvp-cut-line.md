# LYB MVP cut line

**Contract version:** `lyb-mvp-cut-line:v2`
**Source issue:** JOV-6067
**Parent governor:** JOV-6065 (LYB 30-day $5k MRR objective governor — all launch
work ranks against it)
**Tied offer:** JOV-6066 (one ICP, one paid outcome, one price — this cut line
serves that offer; it does not redefine it)
**Downstream contracts:** JOV-6069 (activation/retention), JOV-6071 (launch
surface), JOV-6073 (health trust boundary), JOV-6074 (design-partner loop)

The [JOV-6013 launch contract](lyb-launch-contract.md) owns the audience,
dated-outcome promise, surface inventory, and certification fixture. It
supersedes broader launch scope in this document's earlier revision.

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
| 1 | **Dated outcome + opinionated Jovi coach loop** — persist the user's outcome, date, and constraints; work backward and give one next action; detect drift and adapt it. | **Purchase + retention.** People whose appearance is part of their work need control around dates. A generic directive without a saved outcome/date does not deliver that promise. |
| 2 | **Isolated health memory** — per-user health context stored and scoped for LYB only, never blended into other Jovie data or other users. | **Safety invariant + retention.** Coaching quality depends on remembered context; health data isolation is a non-negotiable trust boundary (JOV-6073). Cannot be retrofit after launch. |
| 3 | **Available body-composition signals** — minimal manual logging and optional HealthKit, photos, or DEXA intake, with provenance and uncertainty. | **Activation + retention.** A manual baseline must reach first value without a scan, medication disclosure, photo, or connection. GLP-1 + DEXA is the initial wedge, not the identity. |
| 4 | **GLP-1-aware coaching boundaries** — where a user is on a GLP-1 (or similar), the coach adjusts recommendations and stays inside explicit safety rails rather than generic hypertrophy advice. | **Safety invariant + purchase.** A material share of the launch ICP is GLP-1-adjacent; wrong advice here is a health-trust breach, not a UX bug. Required by the trust boundary in JOV-6073. |
| 5 | **Swipeable visual timeline** — dated photos and measurements with honest empty states. | **Activation + retention.** The user can understand what changed without founder explanation. |
| 6 | **Stats/body score** — progress against the dated outcome, separating measured, estimated, stale, and unknown values. | **Activation + retention.** Makes status and drift legible without false precision. |
| 7 | **Reliable return and adjustment loop** — timeline, stats, and coach retain the dated goal and next action; check-ins adjust it within the health boundary. | **Retention.** Existing cadence is served inside these surfaces. Training libraries, workout tracking, and voice/live-session UI add no launch surface. |
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
launch page, check out, save an outcome/date/constraints, enter an available
baseline, see the timeline and stats, receive one directive, check in, and
return to adjusted coaching against the dated goal. DEXA, photos, GLP-1
disclosure, and HealthKit remain optional. Safety boundaries hold throughout.
Founder-run steps behind the scenes count toward the demo; broken safety
boundaries do not. LYB-183 owns the app implementation of this contract.

## Notes on evidence

Linear and gbrain were unreachable when this contract was drafted
(`linear-unavailable`, `gbrain-unavailable`); the offer specifics from JOV-6066
(ICP, paid outcome, price) are referenced, not restated, so this document does
not freeze a stale copy. If the locked offer differs from the assumptions above,
the must-ship table is re-ranked, not expanded.
