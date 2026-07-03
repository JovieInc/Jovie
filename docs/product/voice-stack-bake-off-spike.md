# Voice-Stack Bake-Off Spike (GitHub #12768)

Bounded comparison of **xAI Voice Agent Builder** vs **ElevenLabs ConvAI +
telephony layer** for Jovie callable voice features. Output: scorecard, fully-loaded
$/min, and a go/no-go recommendation. Strategy document only — no production voice
routing ships from this issue (gate: JovieInc/Jovie#11908).

> **gbrain note:** query returned no results during dispatch (brain mid-migration).
> Grounding below is public vendor docs + verified in-repo facts (ElevenLabs TTS
> adopted; Twilio SMS adopted; no callable voice stack yet).

## TL;DR: Go / No-Go

**Provisional GO on xAI Voice Agent Builder for the callable stack; keep ElevenLabs
for TTS/voice-clone (already in-repo).**

**One-line rationale:** xAI bundles speech-to-speech + telephony at **~$0.06/min
all-in** with a free provisioned number and first-class hangup/transfer APIs — half
the fully-loaded meter of ElevenLabs ConvAI + Twilio — **pending human voice-quality
sign-off on the pinned bake-off script.**

Live call measurements are **blocked** until `XAI_API_KEY` and `ELEVENLABS_API_KEY`
are provisioned in Doppler (confirmed empty in `jovie-web/dev` on 2026-07-02). Run
the pinned script via `scripts/voice-stack-bake-off/run-bakeoff.ts` once keys land.

## Prior-art gate

| Category | Candidates | Verdict |
| --- | --- | --- |
| Callable voice agent + PSTN | xAI Voice Agent Builder; ElevenLabs ConvAI + Twilio/Vapi | **Adopt** — do not build a calling stack |
| Artist TTS / voice clone | ElevenLabs (`voice-promo.ts`, `voice-clone.ts`) | **Adopt (in-repo)** — orthogonal to telephony choice |
| Outbound SMS | Twilio (`outbound-sms.ts`) | **Adopt (in-repo)** — separate channel |

## Pinned test script

Same persona, same 5-turn flow for both stacks:

- **Fixture:** `scripts/voice-stack-bake-off/test-script.json`
- **Persona:** Luna Waves (indie artist, release in 9 days)
- **Tool under test:** `check_release_schedule` (mocked Jovie profile lookup)
- **Turn 4:** intentional topic-shift / barge-in
- **Turn 5:** explicit hangup

```bash
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/voice-stack-bake-off/run-bakeoff.ts --check-keys
```

## Scorecard (six axes + cost + ergonomics)

Ratings: **1–5** (human judgment) or **Pass / Fail / Pending / N/A**. Live cells
marked *Pending* until keys + human ear QA complete.

| Axis | xAI Voice Agent Builder | ElevenLabs ConvAI + Twilio | Notes |
| --- | --- | --- | --- |
| **Voice quality / naturalness** | *Pending* | *Pending* | Human-in-loop; artist-facing bar from `DESIGN.md` voice tone |
| **Latency (TTF audio, turn p50/p95)** | *Pending* | *Pending* | xAI: single speech-to-speech hop; 11L: `speculative_turn` optional |
| **Tool / function-calling mid-call** | *Pending* | *Pending* | Both support function tools; turn 3 requires `check_release_schedule` |
| **Telephony (in/out, provision, xfer/hangup)** | **Pass (docs)** | **Pass (docs)** | See telephony table below |
| **Fully-loaded $/min** | **~$0.06** | **~$0.10–0.14+** | See cost table below |
| **API ergonomics (create agent, webhooks)** | **4/5 (docs)** | **4/5 (docs)** | Both REST + WS; xAI bundles phone API |

### Telephony capability matrix (documented)

| Capability | xAI | ElevenLabs + Twilio |
| --- | --- | --- |
| Inbound PSTN | Free provisioned US number (`POST /v2/phone-numbers`) | ElevenLabs Twilio integration or BYO SIP |
| Outbound PSTN | SIP + telephony examples in xai-cookbook | Twilio outbound ($0.014/min US) + agent bridge |
| Number provisioning | Included (1 free/team); BYO SIP trunk | Twilio number ~$1.15/mo + 11L hosting |
| Transfer | `POST /v1/realtime/calls/{id}/refer` | `transfer-to-number` system tool |
| Hangup | `POST /v1/realtime/calls/{id}/hangup` | Agent workflow / Twilio end call |
| Webhooks | `realtime.call.incoming` (signed) | Post-call + webhook tools |

### Fully-loaded $/min (US PSTN, conversational minute)

Assumes ~50/50 inbound/outbound mix at low volume; excludes tool surcharges and
LLM overages.

| Line item | xAI | ElevenLabs + Twilio |
| --- | ---: | ---: |
| Voice / agent platform | $0.05 | $0.08 |
| Telephony transport | $0.01 (bundled free number) | ~$0.012 (Twilio in+out blend) |
| LLM (conversation) | Included in voice meter | At cost (was absorbed; vendor will pass through) |
| **Total (documented floor)** | **~$0.06/min** | **~$0.10/min + LLM** |
| Burst / overage | Voice API rate only | $0.16/min burst; LLM variable |

**Jovie credits on hand:** ElevenLabs subscription minutes offset the $0.08 platform
line for early bake-off only — fully-loaded planning should use overage rates.

Sources: [xAI pricing](https://docs.x.ai/developers/pricing#voice-api-pricing),
[xAI Voice Agent Builder announcement](https://x.ai/news/grok-voice-agent-builder),
[ElevenAgents pricing](https://elevenlabs.io/pricing/agents),
[Twilio US voice pricing](https://www.twilio.com/en-us/voice/pricing/us).

## In-repo integration surface

Callable voice should extend existing primitives — not a parallel stack:

| Primitive | Path | Reuse for voice calls |
| --- | --- | --- |
| Voice pipeline webhook | `apps/web/app/api/webhooks/voice-pipeline/route.ts` | HMAC ingress for async agent events (11L today; add xAI signature path) |
| Voice pipeline cron | `apps/web/app/api/cron/voice-pipeline/route.ts` | Sweep pending voice jobs |
| ElevenLabs TTS | `apps/web/lib/ai/tools/voice-promo.ts` | Stays for radio drops — not ConvAI telephony |
| Env keys | `XAI_API_KEY`, `ELEVENLABS_API_KEY` in `env-server-schema.ts` | Provision via Doppler before live bake-off |

## Blockers

| Blocker | Owner | Status |
| --- | --- | --- |
| `XAI_API_KEY` in Doppler `jovie-web/dev` | Human (Slack) | **Missing** (2026-07-02) |
| `ELEVENLABS_API_KEY` in Doppler `jovie-web/dev` | Human (Slack) | **Missing** (2026-07-02) |
| Human voice-quality judgment | Human | **Pending** live calls |
| Callable feature gate | JovieInc/Jovie#11908 | Backlog — bake-off can precede gate |

## Decision (systems framing)

- **Ship now (stack choice):** Default new callable voice work to **xAI Voice Agent
  Builder** for telephony + realtime agent — subject to human ear QA on the pinned
  script.
- **Re-evaluate when:** Luna Waves script scores xAI **≥4/5** on artist-facing
  naturalness AND tool turn 3 passes on 2/2 live runs; OR xAI voice quality <3/5
  on two human reviewers → fall back to ElevenLabs ConvAI + Twilio.
- **Then:** wire chosen stack to `voice-pipeline` webhook + a cron sub-step (no new
  cron route per `infra.md`); file implementation issue under #11908 when gate opens.

**Keep ElevenLabs** for `promotion.voice-promo` / `promotion.voice-clone` regardless —
different surface (async TTS, not PSTN).

## Follow-ups

| Track | Classification | Action |
| --- | --- | --- |
| Live bake-off execution | Required | Re-run pinned script when API keys land; fill *Pending* scorecard cells |
| Callable voice implementation | Required (gated) | JovieInc/Jovie#11908 |
| xAI webhook signature handler | Candidate | Extend `voice-pipeline` route if xAI post-call events differ from 11L HMAC |