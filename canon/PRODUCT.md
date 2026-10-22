# Jovie Product Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Last updated: 2026-10-15

Product exists to increase customer value delivered per week.

Features, polish, experiments, and roadmap items are valid only insofar as they remove the current company bottleneck.

---

## Current homepage MVP

EVENT: JOV-5885 under JOV-5881 scopes `/` to `youtube-artist-closed-loop-mvp-v1`.
[The scoped brief](../docs/marketing/YOUTUBE_ARTIST_MVP.md) owns the YouTube artist
promise, four capabilities, and evidence limits. Atoms stay; machine surface
certification precedes deployed Tim Taste. Source checks prove neither.

## Product Goal

Increase the rate at which customers reach and repeatedly receive value from Jovie.

Primary product question:

> What is the smallest product change that removes the current customer-value bottleneck?

---

## Product Bottleneck Ladder

For product work, classify the bottleneck before proposing a solution:

1. Customer cannot reach production.
2. Customer cannot create an account.
3. Customer does not reach first value.
4. Customer does not start a paid plan.
5. Customer does not complete payment.
6. Customer does not return/retain.
7. Customer does not invite or attract the next customer.

Unknown means measure. Do not guess.

---

## Required Product Proposal Shape

Every product proposal must answer:

- Current bottleneck:
- Customer evidence:
- Metric to improve:
- Expected improvement:
- Smallest reversible change:
- Verification receipt:
- Rollback:

If these fields cannot be answered, the next product task is evidence gathering.

---

## Prioritization Rules

1. Customer behavior outranks internal opinion.
2. Paid behavior outranks free behavior.
3. Retention behavior outranks stated intent.
4. Activation blockers outrank polish unless polish is the activation blocker.
5. A shipped, measured experiment beats a perfect roadmap.

---

## YouTube first; APIs/MCPs are a core product line

**EVENT:** Tim White's September 3, 2026 lock ([JOV-5891](https://linear.app/jovie/issue/JOV-5891))
makes APIs/MCPs a core Jovie product line serving the same artist outcome.
The #1 priority remains `youtube-artist-closed-loop-mvp-v1`
([JOV-5881](https://linear.app/jovie/issue/JOV-5881)): regularly uploading music
artists connect a YouTube channel, improve titles/descriptions/thumbnails, and
insert Jovie links. Use official APIs only. The homepage stays person-first
“Find me”; this line does not turn it into a waitlist or API-docs entry point.

Continue the existing agent-native, MCP action, API/CLI, connector-directory,
and Tim-channel dogfood workstream. The API and CLI share the MCP contract;
there is no second SKU. Sume is the GTM analog (MCP from Pro), not the ICP
analog; do not copy its phone farm. No spend or outbound is authorized by this
lock.

The [strategy thesis](strategy/theses/2026-09-03-apis-mcps-core-not-first.md)
records the existing issue owners and falsifiable proof: one Tim-channel
YouTube optimization via Jovie MCP/CLI, without the GUI, with a dogfood PASS
receipt under [JOV-5883](https://linear.app/jovie/issue/JOV-5883). Source or
unit-test success alone does not establish that product outcome.

---

## Continuous Optimization

Jovie is a continuously optimizing system, not a static link, page, or asset generator. Every shipped user-facing page, link, asset, campaign, recommendation, or content variant carries an internal optimization contract, or the work is an explicit non-product or non-optimizable exception.

Use the existing analytics, model-experiment, audience-event, YouTube-experiment, and release-to-revenue surfaces. Do not create a parallel analytics stack.

### Learning hierarchy

Narrower reliable evidence overrides broader evidence. Broader evidence is a prior only.

1. Platform
2. Medium or channel
3. Country or locale
4. Genre or cohort
5. Artist plus career era or lifecycle
6. Content variant
7. Consented audience segment
8. Fan

Never transfer immutable artist facts or incompatible cohort traits. ZZ Top may inherit a rock-level presentation prior; it must not inherit Kings of Leon's career-era facts or audience assumptions.

### Objective hierarchy

1. Artist business outcome
2. Durable fan value
3. Engagement as an intermediate signal only

Guardrails: complaint, trust, and brand. Personalize at fan level only from first-party, consented behavior. Sensitive demographic inference and cross-platform identity stitching require a separate explicit decision.

### Optimization contract

Required fields: stable variant identity, exposure, outcome, attribution, eligible context dimensions, hypothesis and primary metric, guardrails, privacy and consent, optimizer owner and cadence, decision writeback, and rollback or control.

Automatically promote only bounded, reversible variants after evidence thresholds. Identity or brand permanence, legal or privacy changes, external publication, and material spend remain gated.

Machine enforcement: [`JOV-INV-012`](./invariants.jsonl).

---

## Opinions: outcomes over knobs

Founder intent (Tim White, 2026-09-26): get the ask, deliver the outcome.

These rules are enforceable. A proposal, issue, or PR that breaks one is rejected or reclassified, not debated.

1. **Deliver the outcome; abstract the process.** The user states what they want; Jovie does it. Intermediate steps, pipelines, and internal state are not product surface.
2. **No fiddle surfaces.** Do not ship tooling or UI whose main use is tuning, inspecting, or re-running Jovie's work. It spends the user's attention and our tokens without moving an outcome.
3. **Users do not pick the AI model.** Model, provider, temperature, and prompt choice are Jovie's job. This kind of configurability ships only as a deep feature after paying Pro-level customers ask for it.
4. **Opinionated defaults over settings.** Pick the right default and ship it. A setting is allowed only when the platform requires it (OS permissions, legal consent, unsubscribe) or when users genuinely differ and no default can be right for most of them.
5. **One control, not a matrix.** When a control is unavoidable, ship the single system-standard one (on/off, revoke, delete), never a per-item grid.

### Capability classification

Any agent proposing, filing, or building a capability classifies it first:

| Class | Test | Action |
|---|---|---|
| **table-stakes** | Any user of this surface type expects it; its absence reads as broken or untrustworthy. | Ship. File as `capability-gap`. |
| **outcome-deepening** | Makes the core outcome better, faster, or more automatic without asking the user to do more. | Ship. File as `capability-gap`. |
| **configurability/tooling** | Knobs, pickers, dashboards, or controls for tuning how Jovie works. | **Hold.** No issue. Record the ask in customer asks / waitlist wants; revisit at 3 distinct paying Pro asks. |
| **taste** | Identity, brand, voice, default direction, or anything where the right answer is judgment, not evidence. | Founder decision card. |

Examples:

- Password reset or account recovery: table-stakes. Jovie is passwordless, so recovery means email OTP plus self-serve change email.
- Touch ID on the Mac app, Face ID on iOS: table-stakes for native apps holding a business session.
- In-app account deletion on iOS: table-stakes (App Store requirement).
- Auto-importing a Linktree during onboarding: outcome-deepening.
- An AI model picker: configurability. Held.
- Custom analytics dashboards, per-event notification matrices, custom CSS: configurability. Held.
- Whether biometric lock defaults on or off: taste; the Ovie decision below settles its current default.

The per-surface table-stakes checklist lives in [`docs/product/CAPABILITY_BASELINE.md`](../docs/product/CAPABILITY_BASELINE.md). "Competitor parity without customer evidence" (Anti-Goals) still applies to everything except table-stakes: table-stakes is the one place peer evidence is sufficient.

### Ovie privacy lock (founder decision, 2026-09-29)

**EVENT:** The additional passkey privacy lock is Ovie-only and opt-in. Ordinary
Jovie use must not be blocked by it, including a legacy workspace-lock cookie.
A successful unlock remains effective until an explicit re-lock or 24 hours
after verification. Navigation, reloads, and app relaunch must not restart the
prompt or extend that deadline. Once unlocked, the protection gets out of the way.

When enabled and locked, protect private data and agent actions at the server
boundary as well as the composed screen. Search, cached suggestions, inspectors,
and other app-owned overlays cannot reveal protected content or replace the lock.
Client cookies and hidden content alone are not proof of authorization. Sign-in,
ownership, roles, and privileged-action permissions remain mandatory; privacy
unlock never grants a role or expands an agent's authority.

Keep one clear enable/disable control and one explicit lock action within Ovie.
Store the opt-in independently from the expiring unlock receipt; expiration must
lock an enabled workspace, not silently disable its protection. Failed verification
or a persistence failure must not report a successful unlock.

This supersedes JOV-6829's earlier extension of workspace locking to regular
creator users. JOV-7205 owns implementation and regression evidence; JOV-6506
owns the native sweep and exact delivered-runtime retest. These are requirements,
not a claim that the current distributed app satisfies them.

### Jovie and Ovie mirror one shell (founder decision, 2026-10-20)

**EVENT:** Tim White, 2026-10-20: "jovie and ovie same app shell, same nav,
same sidebar, same presence system, same chat composer and ui. when we improve
we improve both. just different content/user. but jovie is to run closed loop
creator career, ovie is to run closed loop company, you can launch creative
releases on jovie and company release on ovie. they should be mirrors, where
possible in terms of DS and IA."

- One shared shell owns layout, navigation, sidebar, presence, composer, the
  living canvas, and the card renderer. It is parameterized by persona and
  content source. There is no Ovie-only shell; an improvement to a shared owner
  lands in both apps.
- The IA mirrors: Home shows what matters, then what is blocked on the user,
  what is in flight, what is done today, and releases. Jovie fills it with the
  creator's career loop and creative releases; Ovie fills it with the company
  loop and company releases (ship and deploy).
- Ovie's Home is a living canvas: one composer, with generated UI that updates
  Home sections in place, a restorable history, and layout-stable card swaps.
  One-click answers execute immediately with a five-second undo. Ovie Home is
  dashboard-dense on a MacBook Pro.

### Ovie is one Home (founder decision, 2026-10-21)

**EVENT:** Tim White, 2026-10-21: "Move the shipping dashboard into Ovie, and
consolidate Ovie into ONE minimal set of screens with all the data he needs and
NO scrolling. Full screen must look right on a Retina MacBook Pro and a 27\"
ultrawide."

- Ovie's navigation is Home plus one collapsed Tools group. Home carries the
  shipping pulse, asks for the founder, in-flight work by stage, done today and
  stage timings; lists show "+N more" instead of scrolling.
- Needs You folds into Home's asks. Every other operator screen stays reachable
  from Tools, the command palette, or a "+N more" drilldown.

Canon boundaries still hold: Ovie is presentation, not an agent; Summer and
Jovie remain the two agents. JOV-5959 owns the Ovie Home implementation.

---

## Anti-Goals

Do not optimize for:

- Features shipped.
- Agent output volume.
- Internal excitement.
- Competitor parity without customer evidence.
- Technical elegance without user throughput impact.

---

## Relationship to Other Canon

- Engineering implements the smallest correct product constraint removal.
- Design makes value legible and reduces friction.
- Marketing creates qualified demand for the current product bottleneck stage.
- Voice makes the customer promise clear and truthful.

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-10-21 | Ovie is one no-scroll Home plus a collapsed Tools group. | Tim White |
| 2026-10-20 | Jovie and Ovie mirror one shell and IA; Ovie Home is a living canvas. | Tim White |
| 2026-10-15 | Recorded September 3 lock: YouTube artist loop first; APIs/MCPs are a core line on the same contract and workstream. | Tim White / JOV-5891 |
| 2026-09-26 | "Opinions: outcomes over knobs" rules and capability classification (table-stakes / outcome-deepening / configurability held / taste). | Tim White |
| 2026-08-28 | Continuous-optimization doctrine, learning hierarchy, safe transfer, and objective hierarchy. | Tim White / JOV-4045 |
| 2026-07-17 | Created as domain canon under `/canon`. | Tim White |
