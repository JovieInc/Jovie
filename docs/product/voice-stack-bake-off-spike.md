# Voice-Stack Bake-Off Spike (GitHub #12768)

Bounded comparison of **xAI Voice Agent Builder** vs **ElevenLabs ConvAI +
telephony layer** for Jovie callable voice features. Output: six-axis scorecard on a
pinned script, fully-loaded $/min, and a go/no-go for the **callable voice agent**
stack. Strategy document only — no production voice routing ships from this issue
(gate: [JovieInc/Jovie#11908](https://github.com/JovieInc/Jovie/issues/11908)).

> **gbrain note:** query returned no prior-art pages during this spike (Air
> migration noise). Grounding is public vendor docs + verified in-repo facts
> (ElevenLabs TTS adopted; Twilio SMS adopted; no callable voice stack yet).

## TL;DR: Go / No-Go

**Conditional GO on xAI Voice Agent Builder for callable voice; keep ElevenLabs
for async TTS + voice-clone only.**

One-line rationale: xAI bundles speech-to-speech + telephony at **~$0.06/min
all-in** (~45% below ElevenLabs ConvAI + Twilio at **~$0.11/min**), with fewer
hops and a free provisioned number — but it is **beta (2026-07-01)** and
**artist-facing voice quality is still human-pending** until API keys land.

Live call measurements are **blocked** until `XAI_API_KEY` and `ELEVENLABS_API_KEY`
are provisioned in Doppler (confirmed empty in `jovie-web/dev` on 2026-07-02).

| Stack role | Verdict |
| --- | --- |
| **Callable agent (inbound/outbound phone + tools)** | **Adopt xAI** when #11908 opens, after human voice pass |
| **Async promo TTS / voice clone** | **Keep ElevenLabs** (already shipped: `ELEVENLABS_API_KEY`, webhooks) |
| **Fan SMS / release alerts** | **Unchanged** (Twilio outbound — separate from this spike) |

## Prior-art gate

| Category | Candidates | Verdict |
| --- | --- | --- |
| Real-time voice agent + telephony | xAI Voice Agent Builder; ElevenLabs ElevenAgents + Twilio; ElevenAgents + Vapi + Twilio | **Adopt xAI** for net-new callable path; **wrap** ElevenLabs for existing TTS/clone |
| Artist TTS / voice clone | ElevenLabs (`voice-promo.ts`, `voice-clone.ts`) | **Adopt (in-repo)** — orthogonal to telephony choice |
| Outbound SMS | Twilio (`outbound-sms.ts`) | **Adopt (in-repo)** — separate channel |
| Speech-to-text + LLM + TTS assembly | Raw Twilio Media Streams + custom | **Do not build** (proactive-outreach spike already ruled this out) |

**In-repo facts (verified):**

- ElevenLabs is adopted for TTS/clone: `apps/web/lib/ai/tools/voice-promo.ts`,
  `voice-clone.ts`, `app/api/webhooks/voice-pipeline/route.ts`.
- No callable voice agent or telephony orchestration exists in app code today.
- Twilio is adopted for **SMS**, not voice calls (`docs/NOTIFICATION_GUIDELINES.md`).

## Pinned bake-off script

Canonical source: `apps/web/lib/voice-stack-bake-off/test-script.ts`.

- **Persona:** Jovie AI music career manager (Luna Waves demo artist).
- **Mid-call tool:** `lookup_upcoming_release(artistId)` → `{ releaseTitle,
  releaseDateIso, draftPostCount }`.
- **5-turn flow:** greet → consent to lookup → **tool on turn 3** → summarize
  release + drafts → queue posts + hangup.
- **Turn 4:** intentional topic-shift / barge-in.
- **Turn 5:** explicit hangup.

JSON fixture mirror: `scripts/voice-stack-bake-off/test-script.json`.

Run the script + cost table locally:

```bash
doppler run --project jovie-web --config dev -- \
  pnpm --filter @jovie/web exec tsx scripts/voice-stack-bake-off-spike.ts

# Optional WS latency probe when XAI_API_KEY is provisioned:
doppler run --project jovie-web --config dev -- \
  pnpm --filter @jovie/web exec tsx scripts/voice-stack-bake-off-spike.ts --probe-xai

# Validate pinned JSON script + print scorecard template:
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/voice-stack-bake-off/run-bakeoff.ts --check-keys
```

## Scorecard (six axes)

Scores use a 1–5 rubric (5 = best). **Structural** rows are grounded in public
docs + API surface review. **Live** rows need provisioned keys + human ear
(judgment routed via Slack per issue).

| Axis | xAI Voice Agent Builder | ElevenLabs ConvAI + telephony | Evidence / status |
| --- | :---: | :---: | --- |
| **1. Voice quality / naturalness** | TBD (human) | TBD (human) | **BLOCKED** — needs live calls on pinned script. xAI claims speech-to-speech + τ-voice bench lead; ElevenLabs strength is premium TTS timbre. |
| **2. Latency (TTFA, turn)** | TBD (live) | TBD (live) | xAI: single speech-to-speech path ([blog](https://x.ai/news/grok-voice-agent-builder)). EL: STT→LLM→TTS pipeline. WS probe via `--probe-xai` when keyed. |
| **3. Tool reliability mid-call** | 4 (structural) | 4 (structural) | Both expose function tools + webhooks. Turn 3 must call `lookup_upcoming_release` with correct args. Live pass/fail TBD. |
| **4. Telephony** | 5 | 3 | xAI: free number, inbound/outbound, SIP BYO, transfer/hangup in builder ([blog](https://x.ai/news/grok-voice-agent-builder)). EL: Twilio integration or Vapi layer — more assembly. |
| **5. Fully-loaded $/min** | **5** ($0.06) | **3** (~$0.11 Twilio) / **2** (~$0.16 Vapi) | See [Cost model](#cost-model). |
| **6. API ergonomics** | 4 | 4 | xAI: REST + WS realtime + no-code builder + telephony cookbook ([docs](https://docs.x.ai/docs/guides/voice/agent)). EL: mature agents API + versioning; telephony is BYO. |

**Weighted call:** xAI leads on cost + telephony integration; ElevenLabs leads on
existing Jovie voice-clone investment. **Voice quality is the gating human
judgment** — if xAI sounds worse than EL on artist-facing bar, revert callable
path to ElevenLabs + Vapi despite higher $/min.

### Telephony capability matrix (documented)

| Capability | xAI | ElevenLabs + Twilio |
| --- | --- | --- |
| Inbound PSTN | Free provisioned US number (`POST /v2/phone-numbers`) | ElevenLabs Twilio integration or BYO SIP |
| Outbound PSTN | SIP + telephony examples in xai-cookbook | Twilio outbound ($0.014/min US) + agent bridge |
| Number provisioning | Included (1 free/team); BYO SIP trunk | Twilio number ~$1.15/mo + 11L hosting |
| Transfer | `POST /v1/realtime/calls/{id}/refer` | `transfer-to-number` system tool |
| Hangup | `POST /v1/realtime/calls/{id}/hangup` | Agent workflow / Twilio end call |
| Webhooks | `realtime.call.incoming` (signed) | Post-call + webhook tools |

## Cost model

Computed in `apps/web/lib/voice-stack-bake-off/cost-model.ts` (unit-tested).

| Stack | Voice agent | Telephony | LLM pass-through | Platform | **Fully loaded** |
| --- | ---: | ---: | ---: | ---: | ---: |
| **xAI Voice Agent Builder** | $0.05/min | $0.01/min | $0 (bundled) | $0 | **$0.06/min** |
| **ElevenLabs + Twilio** | $0.08/min | ~$0.015/min blended | ~$0.02/min est. | $0 | **~$0.115/min** |
| **ElevenLabs + Vapi + Twilio** | $0.08/min | ~$0.009/min | ~$0.02/min est. | $0.05/min | **~$0.159/min** |

**Jovie credits on hand:** ElevenLabs subscription minutes offset the $0.08 platform
line for early bake-off only — fully-loaded planning should use overage rates.

Sources (retrieved 2026-07-02):

- xAI: [$0.05/min voice + $0.01/min telephony](https://x.ai/news/grok-voice-agent-builder), [pricing table](https://docs.x.ai/developers/pricing#voice-api-pricing)
- ElevenLabs: [$0.08/min ElevenAgents PAYG](https://elevenlabs.io/blog/weve-lowered-api-agents-pricing-and-introduced-pay-as-you-go) (LLM pass-through noted as eventual)
- Twilio US: [local inbound $0.0085/min, outbound $0.014/min](https://www.twilio.com/en-us/voice/pricing/us)
- Vapi: [$0.05/min hosting](https://vapi.ai/pricing) (model at cost)

**Cost Impact at scale (order-of-magnitude):**

| Volume | xAI | ElevenLabs + Twilio |
| --- | ---: | ---: |
| 1,000 min/mo (pilot) | ~$60 | ~$115 |
| 10,000 min/mo | ~$600 | ~$1,150 |

Callable voice is **O(minutes)** not O(users). Gate spend behind #11908 + per-artist
opt-in (see proactive-outreach TCPA notes for Phase 2 voice consent).

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

## Live bake-off procedure (human-in-loop)

1. Provision `XAI_API_KEY` + ElevenLabs agent keys (Slack / Doppler — **human step**).
2. Configure both agents with `JOVIE_VOICE_PERSONA_PROMPT` + `lookup_upcoming_release` tool returning `BAKE_OFF_TOOL_FIXTURE`.
3. Place two outbound test calls (same script, same voice gender/timbre class).
4. Record: TTFA (ms), turn latency (ms), tool invoked Y/N, transcript accuracy.
5. Human scores voice naturalness 1–5 (artist-facing bar).
6. Update scorecard rows 1–2 in this doc or a gbrain decision page.

## Decision triggers (systems, not events)

- **Ship xAI callable path when:** #11908 gate opens **and** human voice score ≥
  ElevenLabs on pinned script **and** tool call succeeds on 3/3 trial calls.
- **Re-evaluate when:** xAI pricing changes, beta SLA incidents, or monthly
  callable minutes exceed **5,000** (≈ $300/mo at $0.06); OR xAI voice quality <3/5
  on two human reviewers → fall back to ElevenLabs ConvAI + Twilio.
- **Then:** wire chosen stack to `voice-pipeline` webhook + a cron sub-step (no new
  cron route per `infra.md`); if unit economics break, re-run bake-off against
  Retell/Bland or negotiate ElevenLabs enterprise bundle.

**Keep ElevenLabs** for `promotion.voice-promo` / `promotion.voice-clone` regardless —
different surface (async TTS, not PSTN).

## Follow-ups

| Item | Tracking |
| --- | --- |
| Live call bake-off + human voice scores | Blocked on API key provisioning — reopen when keys land in Doppler |
| Wire xAI telephony agent behind feature flag | Depends on #11908 gate |
| xAI webhook signature handler | Candidate — extend `voice-pipeline` route if xAI post-call events differ from 11L HMAC |
| TCPA express voice consent UX | See `docs/product/proactive-outreach-discovery-spike.md` Phase 2 |
| Persist callable call logs + webhook dedupe | Required before production — new Linear issue at implementation time |

## References

- GitHub #12768 (this spike), #11908 (callable feature gate)
- `docs/product/proactive-outreach-discovery-spike.md` — Phase 2 voice sketch
- `apps/web/lib/voice-stack-bake-off/` — pinned script + cost model
- `scripts/voice-stack-bake-off/` — JSON fixture + bake-off runner
- xAI Voice Agent Builder announcement (2026-07-01)
- ElevenLabs ElevenAgents pricing reduction (2026-05-07 / updated 2026-06-29)