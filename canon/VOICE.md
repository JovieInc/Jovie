# Jovie Voice and Copy Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Executable authority: [`packages/copy`](../packages/copy) (`@jovie/copy`)
Last updated: 2026-09-25

This is the one copywriting system for everything Jovie writes: our marketing,
product UI, customer email and texts, the Jovie persona, founder drafts, and
work we write on behalf of customers. Policy lives here. Rules, tiers, the judge
panel, and the landing pipeline live in `@jovie/copy`. No other file may keep a
second banned-word list, rubric, or copy gate.

Supersedes: Ops `01-canon/03-writing-guide.md` style rules,
`prompts/copywriting-audit.md`, `scripts/slopcheck.py`, and the private rule
lists in `apps/web/lib/chat/voice-lint.ts` and `apps/web/data/marketing/copy.ts`
(both now consume `@jovie/copy`).

---

## Goal

Say the smallest true thing that moves the reader to the next value moment.

> What does the reader need to believe, understand, or do next, and what is the
> fewest true words that gets them there?

Marketing sells outcomes. Product text removes friction. Communications respect
the reader's time. Customer work sounds like the customer, only better edited.

---

## The floor: impossible to ship

These block in every register, including founder voice and customer voice.
Runtime senders must not send, CI fails on new occurrences, and the agent skill
must rewrite. Nobody can waive them (`UNWAIVABLE` in `lint.ts`).

| Category | Blocks |
|---|---|
| Harm | Insults or profanity aimed at a person, threats, intimidation, self-harm language |
| Legal | Outcome guarantees, income claims, "risk-free," fake scarcity, unsourced superlatives ("#1," "the best in the world") |
| Platform | Bought or artificial streams, followers, plays, or playlist placement (DSP and social ToS) |
| Privacy | Credentials, keys, secrets |
| Leak | Chatbot residue ("As an AI," "Certainly!," "I hope this email finds you well"), unfilled template slots |
| Negativity | Contempt for customers, fans, artists, investors, or other businesses |
| Truth | Claims the product cannot back: messaging a DSP audience, ownership before verification |
| Style | Em and en dashes (founder decision, 2026-09-25: banned everywhere) |

Anything that could hurt customers, the company, or investors is a floor
failure even when no regex catches it. Judges score it as `safety` and a single
confident failure blocks.

---

## Craft rules

Distilled from Apple's HIG writing guidance, Tim's canon, and what actually
converts. Deterministic where a machine can check; judged where it cannot.

1. **Lead with the outcome.** What the reader gets or can now do comes first.
   Features and mechanism come second, if at all.
2. **Every word earns its place.** Cut until meaning breaks, then restore one word.
3. **Specific beats impressive.** Numbers, names, dates, and scenes beat adjectives.
   "See which link turned a listener into a subscriber" beats "powerful insights."
4. **One idea per sentence.** Short declaratives. Vary the length so it reads aloud.
5. **Customer words, not ours.** No internal jargon, no prompt words (concise,
   premium, cinematic), no selling the artifact (mockups, renders, registries).
6. **Confidence matches evidence.** Only claim what a capability and its evidence
   support. Unreleased work is labeled as such.
7. **Kind under pressure.** Errors say what happened and what to do. Never blame.
8. **House mechanics.** Sentence case headlines, Oxford comma, numbers under 10
   spelled out in prose, one exclamation mark per piece at most, no em dashes.

### AI tells (blocked in Jovie and founder registers)

"It's not X, it's Y." Stock openers and closers ("Here's the thing," "Let that
sink in," "Excited to announce"). Corporate verbs (leverage, seamless, robust,
elevate, empower). Style adjectives standing in for outcomes ("a modern, elegant
experience"). Stock contrasts ("more than just"), from-X-to-Y frames, rhetorical
headlines, stock transitions (furthermore, moreover). The judge rubric's `human`
dimension catches what regex cannot: triple beats, perfectly symmetrical
comparisons, question-then-answer, mic-drop closers, callback bookends.

---

## Registers

Voice is constant; tone adapts. Each output declares one register. The floor
applies to all of them; house style varies.

| Register | Who is speaking | Style |
|---|---|---|
| `jovie-marketing` | Jovie on jov.ie, ads, launches | Apple-grade outcome copy. Proof over adjectives. No emoji, no hedging. |
| `jovie-product-ui` | The app | Clear, concise, most important information first. |
| `jovie-transactional` | Lifecycle, billing, support messages | Plain, warm, brief. Subject says the point. One action. |
| `jovie-persona` | Jovie the character (chat, social) | Warm to artists, ruthless to bad systems. Opens with the take. No hedging, no apologies, no emoji. |
| `founder-tim` | Anything in Tim's name | Casual, direct, dry. One vivid example. Swearing for emphasis is fine; never at a person. |
| `customer-voice` | A customer, written by us | Their voice from their samples: their slang, their emoji. Only the floor applies. |

**Brand frame** (from the Ops voice guard; founder, persona, and marketing
registers): never disparage Tim or Jovie, never mirror someone's failure onto
Tim ("Been there," "I know how that feels"), never claim experience the Tim
White canon does not document, never frame the company as behind, lucky, or
hoping. Reframe toward the useful insight. Rule: `brand-frame`.

Customer work never impersonates anyone else and never makes claims the customer
cannot back. Their voice, our floor.

---

## Stakes tiers: spend follows stakes

Judge spend scales with how often text runs and how much it matters (founder
direction, 2026-09-25). Configured in `judge.ts` (`JUDGE_ROSTER`, `TIER_POLICY`).

| Tier | Use for | Gate | Cost |
|---|---|---|---|
| `flagship` | Homepage, landing pages, launches, investor copy | Lint, then a cross-family judge panel (at least two families other than the generator), bar 8/10 on every dimension, up to four rewrite rounds | Highest; worth it |
| `standard` | Campaigns, founder drafts, blog, one-off customer work | Lint, then one cheap judge (GLM-5.3-flash), bar 7/10, up to two rounds | Fractions of a cent |
| `volume` | Jovie and Summer conversations, inbox replies, anything around 500 times a day | Deterministic lint only | Zero tokens, microseconds |

Judges route by family and respect the gateway allowlist (founder rule,
2026-09-17): `zai/*` (GLM) runs on the Vercel AI Gateway; Claude runs on the
Claude Code CLI and GPT on the Codex CLI, both on subscriptions. A panel that
cannot seat enough judges returns `blocked`, never a silent pass.

Panel rules, from judge-bias research: the generator's model family never judges
its own output; judges score a fixed rubric (`outcome`, `specificity`, `economy`,
`voice`, `truth`, `safety`, `human`); length earns nothing; a majority must pass;
any judge confident (>= 0.8) that copy is untrue or unsafe blocks it; judge
errors and missing scores fail closed. Exhausted rewrite rounds return `blocked`,
and blocked copy does not ship. Jev may sample volume text as an advisory
shadow; it never adds latency or blocks a send.

---

## Send authority

- Copy in Jovie registers that passes its tier's gate ships with no human review:
  pages, product text, transactional and lifecycle messages, persona replies.
- Anything in Tim's name is drafted, gated at `standard` or higher, and queued for
  one-tap send. Identity risk stays with Tim.
- Customer-voice work passes the floor plus its tier, then follows the customer's
  own approval and consent rules.

---

## Landing pages are compiled, in order

A great page needs great capabilities, then outcomes, copy, layout, style, the
design system, product proof, and stats and quotes. `runLandingPipeline` runs
these as separate gated stages; an agent works the first failing stage until it
passes, then moves on. It never skips ahead.

1. **Capabilities**: what the product does today, each with route, test, or
   ProductMoment evidence.
2. **Outcomes**: what the reader gets, each resting on released capabilities.
3. **Copy**: every section argues one outcome; hero headline <= 8 words; CTA
   <= 4 words with a real destination; every line passes the lint; flagship
   judge panel.
4. **Layout**: an approved recipe that places every section once
   (`apps/web/data/marketing` registry).
5. **Style**: theme and token version declared.
6. **Design system**: registered components only.
7. **Proof**: the hero promise shows real product from a reproducible source.
8. **Social**: stats are numbers with sources dated within a year; quotes are
   attributable, permissioned, and in the speaker's own voice.

The existing meaning-first marketing contracts (`MarketingCopyPageBrief`, claim
and outcome bindings, Taste Inbox) remain the section-level authority inside
stage 3.

---

## Where it is enforced

| Surface | Enforcement |
|---|---|
| Pull requests | `ci-fast` lane `copy-gate`: lints lines the PR adds in customer-facing paths (`apps/web/content`, `apps/web/data/*Copy.ts`, email templates, onboarding script). New floor or house-style violations fail. Legacy lines stay advisory. Legal pages are excluded. |
| Runtime | Every model-generated customer-facing message calls `lintCopy` (volume) or `gateCopy` (standard or flagship) before it is shown or sent. |
| Agents | The `copywriting` skill runs `writeUntilPass` and the landing pipeline. It cannot hand back text that has not passed. |
| Tests | Unit tests lint every scripted line, calibration example, and template in its register. |

Local commands: `pnpm copy:check [--diff-base origin/main] <files>`,
`pnpm copy:landing <spec.json>`, and
`pnpm copy:judge --tier flagship --register jovie-marketing --facts facts.txt <file>`
(runs through the repo's Doppler wrapper).

---

## Changing the rules

- Add or tighten a rule in `packages/copy/rules.ts` with a failing fixture and a
  passing control in `copy.test.ts`. A rule without a passing control is a word
  ban, and word bans are how good copy dies.
- Founder taste feedback is local by default. It becomes a rule only when Tim
  promotes it.
- Loosening the floor, or moving a gate from blocking to advisory, is an
  `EVENT:` decision.

---

## Action-only agent communication

Agent and automation messages are part of company voice. They remove work from
humans; they do not create it.

- No routine success updates to founder-facing channels.
- No bot-to-bot chatter in human channels.
- No message unless a human must personally act or decide.
- Decision pings state what happened, why it matters, the exact need, the default
  if silent, and a link or receipt.

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-09-25 | Became the single copy canon. Added the floor, registers, stakes tiers, send authority, landing pipeline, and `@jovie/copy` as the only executable rule set. Em dashes banned everywhere. Retired Slop Gate. | Tim White |
| 2026-07-17 | Created as domain canon under `/canon`. | Tim White |
