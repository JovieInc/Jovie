# x402 Payment-Gated Artist Resources — Spike (GitHub #12750)

Time-boxed spike (~1–2 days) to prove the **x402** 402→pay→retry flow end-to-end on
one artist resource before **Monetization Gateway** GA, using Cloudflare's published
**x402 "Payment-Gated Proxy" Worker template**. Strategy document + reproducible
unit-economics model only — **no payment rails, wallet, or Worker deploy ships from
this issue** (deploy is human-gated; see [Blockers](#blockers)).

> **gbrain note:** query returned no prior-art pages for this spike (Air migration
> noise, 2026-07-03). Grounding is public vendor/primary docs (cited inline,
> retrieved 2026-07-03) + verified in-repo facts. Flagged unknowns are marked
> **UNVERIFIED** and routed to human/primary-source confirmation, not guessed.

## TL;DR: Go / No-Go

**Conditional GO** on x402-priced artist datasets / MCP tools as the Monetization
Gateway **P2 lane** — pilot the **self-hosted Cloudflare Worker template first**;
**defer the managed Gateway rules-API build** until waitlist access lands.

One-line rationale: the Worker template gives **true per-resource pricing**
(`PROTECTED_PATTERNS`, distinct USDC price per route) — the thing Pay Per Crawl's
one-price-per-zone model can't do — and on Base the rails are effectively free
(facilitator fee **$0**, gas **<$0.0001**, CDP metering **$0.001/tx** above 1k/mo),
so any sane price ($0.01+) clears the unit-economics gate with wide margin. The
open items are **ops, not protocol**: a human must provision Cloudflare + a Base
wallet, and finance must own the USDC→fiat treasury path.

| Question | Answer | Confidence |
| --- | --- | --- |
| 402→pay→retry works with agent clients? Latency? | **Yes.** +1 round-trip + facilitator verify/settle; ~**300–500 ms** end-to-end (200 ms Base preconf). Fine for non-human agent callers. | High |
| Settlement → fiat; what lands where? | USDC lands **peer-to-peer in the seller wallet**; tx hash is the receipt. Off-ramp is a **separate batch** step (~0–1.5%). | High (fee schedule partly UNVERIFIED) |
| Pricing per resource (vs one-price-per-zone)? | **Yes — Worker template does per-route pricing.** Pay Per Crawl does not. | High |
| Web Bot Auth good enough for attribution? | **Yes** — RFC 9421 + Ed25519 signed requests = cryptographic agent identity, edge-live at Cloudflare. Still an Internet-Draft. | High |
| Unit economics clear the gate? | **Yes.** Per-call fee floor ~$0.0011; min viable price ~**$0.0023**; recommend a **≥$0.01 price floor** per resource. | High |

## Prior-art gate

Category: **agent-payable, per-resource pricing + settlement rails.** Adopt > wrap >
build.

| Category | Candidates | Verdict |
| --- | --- | --- |
| Payment protocol | **x402** (open, Linux Foundation as of 2026-04); L402/Lightning; raw Stripe metered | **Adopt x402** — HTTP-native, agent-first, chain-agnostic (CAIP-2) |
| Edge enforcement + per-route pricing | **Cloudflare x402 Worker template**; DIY Next.js middleware `402` handler | **Adopt template** for the pilot — origin needs zero changes; per-route price built in |
| Managed rules API (per-verb, dynamic, pay-on-success) | **Cloudflare Monetization Gateway** (waitlist) | **Wrap later** — defer until waitlist access; do not build against it now |
| Settlement / facilitator | **Coinbase CDP facilitator** (Base, fee $0); self-hosted facilitator | **Adopt CDP** — zero settlement fee on Base, template defaults to it |
| Agent identity / attribution | **Web Bot Auth** (RFC 9421 + Ed25519); API keys; IP allowlist | **Adopt Web Bot Auth** — cryptographic, IP-independent, already edge-live |
| Build our own 402 rails / facilitator | — | **Do not build** — solved off-the-shelf; build only the resource + price config |

## In-repo facts (verified)

- **No x402 / Pay-Per-Crawl / Monetization-Gateway code exists today** (`grep` across
  the repo, 2026-07-03) — this is genuinely net-new.
- The candidate resource — an **agent-friendly artist surface (llms.txt, .md
  siblings, robots allowlist, MCP server + JSON feed)** — landed via
  [JovieInc/Jovie#11034](https://github.com/JovieInc/Jovie/issues/11034) (CLOSED).
  That MCP server / JSON feed / press-kit dataset is the natural first asset to gate.
- Unit-economics discipline is canon: **≥50% gross margin on AI + infra at expected
  usage** ([`docs/company/PRICING-PHILOSOPHY.md`](../company/PRICING-PHILOSOPHY.md)
  Principle 7). Agents get **work-based**, never **per-seat**, pricing (Principle 3) —
  x402 per-call is a clean work-based meter.
- All API routes are Node runtime; the app already fronts everything through
  Cloudflare — the Worker template sits **in front of** the origin, so no app code
  changes for the pilot.

## The 402 → pay → retry loop (Q1)

Challenge-then-retry handshake, like `401`/`407`:

1. Agent requests the gated resource → origin (via the Worker) returns **`402`** with
   Base64 payment requirements (`scheme` `exact`, `network` CAIP-2 e.g. `eip155:8453`
   Base, USDC asset addr, recipient, max amount, expiry).
2. Agent signs an **EIP-3009** (`transferWithAuthorization`, gasless) EIP-712 payload
   and **retries the same request** carrying the signed payment header.
3. Worker POSTs to the facilitator `/verify` then `/settle`; on success returns
   **`200`** + a settlement header (Base64 JSON incl. **on-chain tx hash**), and the
   template issues an **HttpOnly JWT cookie valid ~1 hour** so repeat calls in the
   window skip re-payment.

**Latency:** one extra HTTP round-trip (the 402) + facilitator verify/settle.
Published Base numbers: **~200 ms** Flashblocks preconfirmation, **~300–500 ms**
realistic end-to-end. Acceptable overhead for **agent** callers (not a human-blocking
path). Header names differ by protocol version (V1 `X-PAYMENT` vs V2
`PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE`) — **pin the version at
implementation time.**

## Settlement → fiat & accounting (Q2)

- **On-chain leg:** the signed authorization moves **USDC on Base directly into the
  seller's wallet** — no intermediary custody. The facilitator submits the tx and
  returns the **tx hash as the durable receipt**.
- **Accounting trail:** signed EIP-3009 authorization → facilitator `/settle` →
  on-chain USDC transfer → tx hash in `PAYMENT-RESPONSE`. That hash ties a payment to
  a fulfilled request — the audit primitive for revenue attribution.
- **USDC → fiat** is a **separate, batched** step (not per call): USDC redeems **1:1**;
  Coinbase **free ACH**, up to **~1.5%** instant debit rail. Model the worst case.
- **Ops reality:** this needs a **Base wallet + treasury/tax handling for USDC
  receipts** — a finance/CFO decision, not a coder task. Escalated as a blocker.

## Per-resource pricing: Worker template vs Pay Per Crawl (Q3)

This is the decisive finding.

| | **Pay Per Crawl** (managed marketplace) | **x402 Worker template** (self-hosted) | **Monetization Gateway** (waitlist) |
| --- | --- | --- | --- |
| Pricing granularity | **One flat price per zone/site** | **Per route** — `PROTECTED_PATTERNS: [{pattern, price, description}]` | Per-verb + **dynamic** ("up to $2 by compute") + pay-on-success |
| Origin changes | None | None (proxy modes: DNS / external origin / service binding) | None (edge-enforced) |
| Settlement | Cloudflare aggregates & pays out | Peer-to-peer to `PAY_TO` wallet via `FACILITATOR_URL` (default CDP) | Peer-to-peer, edge-verified |
| Availability | Beta | **Available now** (public template) | **Waitlist / human signup** |

The template README ships three routes at **$0.01 / $0.10 / $1.00** — so an artist
press-kit dataset and a per-artist MCP tool can carry **different prices on the same
zone today**, which Pay Per Crawl cannot express. This removes the main reason to wait
for the managed Gateway for the *pricing* capability; the Gateway adds dynamic /
per-verb / pay-on-success pricing we can layer on later.

## Web Bot Auth: attribution (Q4)

- Cloudflare-led IETF draft: agents mint an **Ed25519 keypair**, sign requests via
  **HTTP Message Signatures (RFC 9421, ratified)**, and publish the public key at
  `/.well-known/http-message-signatures-directory`. The origin verifies the signature
  → **cryptographically verifiable agent identity, IP-independent.**
- **Attribution: yes.** Combined with the settlement tx hash, a payment can be tied to
  a known agent key. Cloudflare's Monetization Gateway explicitly composes Web Bot Auth
  identity with x402 usage pricing.
- **Maturity:** edge-live at Cloudflare since **March 2026** (Claude, ChatGPT,
  Perplexity, Common Crawl signed); Google migration expected **late 2026**. Still an
  **Internet-Draft, not an RFC** — treat identity coverage as growing, not universal.

### Security notes for the pilot (verify at implementation time)

Desk-research only — no rails ship here, but the pilot must confirm each of these
before any real payment path goes live (they are correct-by-design in the CDP path +
Worker template, but must be verified, not assumed):

- **EIP-3009 replay protection:** the facilitator must enforce single-use `nonce` +
  `validBefore` so a captured `transferWithAuthorization` signature can't be replayed.
- **JWT session cookie is not a shareable bearer:** the template's ~1h HttpOnly JWT
  lets repeat calls skip re-payment — confirm it's bound to the paying agent (not a
  transferable token that could be leaked to bypass payment) and how its signing
  secret is managed/rotated.
- **Bind identity to payment:** Web Bot Auth proves *who asked*; the EIP-3009 signature
  proves *who paid*. Tie tx-hash → agent key cryptographically for revenue attribution
  rather than assuming they're the same principal.

## Unit-economics note (per-call fees vs price floor)

Reproducible model: [`apps/web/lib/x402-spike/unit-economics.ts`](../../apps/web/lib/x402-spike/unit-economics.ts)
(unit-tested, `apps/web/tests/unit/lib/x402-spike.test.ts`). Base + CDP facilitator path.

| Fee component | Value | Note |
| --- | ---: | --- |
| CDP facilitator settlement fee (USDC/Base) | **$0** | zero on Base |
| Base gas per call | **<$0.0001** | gasless via EIP-3009 paymaster |
| CDP facilitator API metering | **$0.001/tx** | free ≤1,000 tx/mo, then metered |
| USDC→fiat off-ramp | **0–1.5%** | batch at redemption, not per call |

- **Fixed per-call rail fee:** ~**$0.0011** at scale (metering + gas); ~**$0.0001**
  below the free tier.
- **Rail overhead** = `offRampRate + fixedFee/price`. Must stay **≤50%** to leave room
  for compute COGS + margin (Principle 7).
- **Minimum viable price** = `fixedFee / (0.5 − offRamp)` ≈ **$0.0023** at metered
  volume (worst-case 1.5% off-ramp). Below the free tier it's **~$0.0002**, on the
  order of the smallest sub-cent x402 price points seen in published examples.
- **Recommendation: price artist resources at a ≥$0.01 floor.** At $0.01 the rails eat
  **~12.5%** (1.5% off-ramp + 11% fixed) — clears the gate ~4× over, leaving ≥50% gross
  margin after the compute cost of serving the dataset/MCP call.

> **Ship now** the self-hosted Worker-template pilot at a $0.01+ price. **Re-evaluate
> when** monthly settlements exceed the CDP free tier (1,000/mo), any off-ramp take-rate
> or Gateway fee is confirmed >0, or a resource's compute COGS pushes total overhead
> past 50%. **Then** either raise the price or move to the managed Gateway for dynamic
> pricing. (Systems, not events, per CLAUDE.md.)

## Blockers (human / finance — cannot be resolved by this agent)

| Blocker | Owner | Status |
| --- | --- | --- |
| Cloudflare account + AI Crawl Control / Worker deploy access | Human (ops) | **Required before live test** |
| Base wallet (`PAY_TO`) + USDC treasury / tax / accounting policy | Finance / CFO | **Required — decision, not code** |
| Monetization Gateway waitlist access (rules-API build) | Human signup → #product | **Gated** (issue says so) |
| CDP facilitator API key (`FACILITATOR_URL`, above free tier) | Human (ops) | **Not provisioned** |
| Off-ramp fee schedule for programmatic x402→fiat sweeps | Finance | **UNVERIFIED** — confirm before revenue model |
| Whether Monetization Gateway adds a take-rate on settlement | Human (Cloudflare rep) | **UNVERIFIED** |
| Whether Cloudflare runs its own facilitator vs. defaulting to CDP | Human (Cloudflare rep) | **UNVERIFIED** |

## Live pilot procedure (human-in-loop, when unblocked)

1. Human provisions a Cloudflare zone with AI Crawl Control + a Base wallet + CDP key.
2. Deploy `cloudflare/templates/x402-proxy-template` in front of **one** asset — the
   #11034 press-kit dataset or per-artist MCP endpoint — with `PROTECTED_PATTERNS` set
   to a single **$0.01** route, `NETWORK: "base"`, `PAY_TO` = treasury wallet.
3. Drive the 402→pay→retry loop with a real x402 agent client (CDP SDK / an
   x402-capable crawler). Record: 402 received, retry succeeds, **end-to-end latency**,
   tx hash, JWT-cookie reuse.
4. Confirm the USDC lands in `PAY_TO`; walk **one** off-ramp to fiat and record the
   real fee.
5. Enable Web Bot Auth on the zone; confirm a signed agent's identity is attributable
   to the settlement tx.
6. Update this doc / a gbrain decision page with measured latency + real off-ramp fee,
   then flip go/no-go on the managed-Gateway lane.

## Decision triggers (systems, not events)

- **Ship the self-hosted pilot when** a human provisions Cloudflare + a Base wallet
  (no further gate — pricing capability is proven).
- **Build the managed Gateway rules-API lane when** waitlist access lands **and** the
  off-ramp/take-rate unknowns are confirmed **and** ≥1 artist opts a resource in.
- **Re-evaluate / no-go if** measured end-to-end latency >2 s on real agent clients,
  confirmed rail overhead >50% at our price floor, or Web Bot Auth attribution proves
  too sparse for revenue-share accounting → fall back to Stripe metered API keys for
  non-agent buyers.

## Follow-ups

Tracked as GitHub issues (Linear MCP was unavailable in this session — GitHub is the
durable fallback in this repo).

| Item | Type | Tracking |
| --- | --- | --- |
| Provision Cloudflare + Base wallet + CDP key, deploy Worker template in front of the #11034 asset, and measure the loop | Required (human) | [#12863](https://github.com/JovieInc/Jovie/issues/12863) |
| Confirm off-ramp fee schedule + any Gateway take-rate | Required (finance) | folded into [#12863](https://github.com/JovieInc/Jovie/issues/12863) |
| Managed Monetization Gateway rules-API build | Candidate | [#12864](https://github.com/JovieInc/Jovie/issues/12864) (blocked on waitlist signup) |

## References

- GitHub [#12750](https://github.com/JovieInc/Jovie/issues/12750) (this spike),
  [#11034](https://github.com/JovieInc/Jovie/issues/11034) (agent-friendly MCP surface)
- Model: `apps/web/lib/x402-spike/unit-economics.ts` + test
- x402: [x402.org](https://www.x402.org/), [whitepaper](https://www.x402.org/x402-whitepaper.pdf),
  [docs.x402.org facilitator](https://docs.x402.org/core-concepts/facilitator),
  [github.com/coinbase/x402](https://github.com/coinbase/x402)
- Coinbase CDP: [docs.cdp.coinbase.com/x402/welcome](https://docs.cdp.coinbase.com/x402/welcome)
- Cloudflare: [Monetization Gateway](https://blog.cloudflare.com/monetization-gateway/),
  [Pay Per Crawl](https://blog.cloudflare.com/introducing-pay-per-crawl/),
  [x402 Worker template](https://github.com/cloudflare/templates/tree/main/x402-proxy-template),
  [AI Crawl Control worker templates](https://developers.cloudflare.com/ai-crawl-control/reference/worker-templates/),
  [Verified Bots with cryptography](https://blog.cloudflare.com/verified-bots-with-cryptography/),
  [Web Bot Auth docs](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)
- IETF: [RFC 9421 HTTP Message Signatures](https://datatracker.ietf.org/doc/html/rfc9421),
  [draft-meunier-web-bot-auth-architecture](https://datatracker.ietf.org/doc/html/draft-meunier-web-bot-auth-architecture)
- Canon: [`docs/company/PRICING-PHILOSOPHY.md`](../company/PRICING-PHILOSOPHY.md) (Principle 3, 7)
