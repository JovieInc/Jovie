# Spike: x402 payment-gated artist resources (Monetization Gateway P2)

> Recon spike for [#12750](https://github.com/JovieInc/Jovie/issues/12750); parent context
> [#11034](https://github.com/JovieInc/Jovie/issues/11034) (per-artist MCP tools). Writeup +
> reproducible unit-economics model; no production payment path changed. Evidence captured
> 2026-07-03.

## Verdict: **Conditional GO**

**Conditional GO** on x402-priced artist datasets / MCP tools as the Monetization Gateway
**P2 lane** — pilot the **self-hosted Cloudflare Worker template first**, **defer the managed
Gateway rules-API build** until waitlist access lands. Open items are ops/finance, not protocol.

---

## Goal

Prove the x402 402→pay→retry flow on one artist resource before Monetization Gateway GA,
using Cloudflare's published [x402 Payment-Gated Proxy](https://github.com/cloudflare/templates/tree/main/x402-proxy-template)
Worker template in front of a test asset (press-kit share drop or per-artist MCP tool).

---

## What we evaluated

| Surface | Evidence |
| --- | --- |
| Cloudflare x402-proxy template | README + live demo (`/__x402/protected` → 402) |
| x402 protocol (V2 headers) | [Cloudflare x402 docs](https://developers.cloudflare.com/agents/tools/payments/x402/) |
| Pay Per Crawl (zone pricing) | [Cloudflare docs](https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/) — closed beta, one-price-per-zone |
| Monetization Gateway | [CF blog 2026-07-01](https://blog.cloudflare.com/monetization-gateway/) — waitlist, rules API |
| Web Bot Auth | [CF Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/) — RFC 9421 HTTP message signatures |
| Unit economics | `apps/web/lib/x402-spike/unit-economics.ts` (unit-tested) |
| Jovie pilot config | `workers/x402-artist-resource-proxy/wrangler.example.jsonc` |

**Live deploy status:** not executed in this spike — requires human-provisioned Cloudflare
account, Base wallet, and `JWT_SECRET`. The template's `npm run test:client` path is the
canonical e2e proof once credentials exist.

---

## The four gating questions

### 1. Does 402 → pay → retry work with current agent clients? Latency?

**Yes, architecturally.** The x402 flow is:

1. `GET /resource` → `402 Payment Required` + `PAYMENT-REQUIRED` header (price, token, network, merchant address).
2. Client signs payment payload, retries with `PAYMENT-SIGNATURE`.
3. Facilitator `POST /verify` + `POST /settle` → resource returned with `PAYMENT-RESPONSE`.

The x402-proxy template uses V1 `X-PAYMENT` headers; Cloudflare's current docs describe V2
`PAYMENT-*` headers. **Pin the header version at implementation time** — both work, but mixing
client/server versions fails closed.

**Latency overhead:** +1 round-trip for the 402, then facilitator verify/settle. Cloudflare
targets sub-second settlement on Base; Base Flashblocks preconf ~200 ms. End-to-end
**~300–500 ms** for agent callers — acceptable for non-human buyers (MCP tools, dataset exports).

**Agent client support:** `@x402/fetch` and Agents SDK `withX402Client` handle the retry loop
automatically. Human browsers are not the target buyer.

### 2. Settlement: stablecoin receipt → fiat redemption — what lands where?

| Step | What happens | Accounting note |
| --- | --- | --- |
| Payment | USDC transfers peer-to-peer to seller `PAY_TO` wallet | On-chain tx hash = receipt |
| Facilitator | Verifies + broadcasts; does **not** hold funds | Log facilitator response + tx hash |
| Fiat off-ramp | Separate batched USDC→fiat sweep (~0–1.5%) | Treasury/tax policy required (finance) |

**What lands where:** USDC in the artist/platform wallet immediately; fiat only after an
explicit off-ramp. Jovie accounting needs a new ledger line for on-chain receipts (tx hash,
amount, resource ID, buyer attribution if Web Bot Auth present) — distinct from Stripe Connect.

**UNVERIFIED:** exact off-ramp fee schedule for programmatic x402→fiat sweeps at Jovie volume.

### 3. Can pricing vary per resource (vs Pay Per Crawl one-price-per-zone)?

**YES — decisive win for the Worker template.**

Pay Per Crawl sets **one price per zone** (closed beta, Cloudflare as Merchant of Record).
The x402-proxy template's `PROTECTED_PATTERNS` supports **per-route pricing**:

```jsonc
{ "pattern": "/drop/*/assets/*", "price": "$0.01" },
{ "pattern": "/api/mcp/artist/*/press-kit", "price": "$0.10" }
```

See `workers/x402-artist-resource-proxy/wrangler.example.jsonc` for Jovie-shaped routes
(press-kit share drops + per-artist MCP tools from #11034).

The managed Monetization Gateway adds per-verb, dynamic, and pay-on-success pricing later —
but is waitlist-gated. The self-hosted template is unblocked today.

### 4. Web Bot Auth: can we identify the paying agent for attribution?

**Yes, with caveats.**

[Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)
(RFC 9421 HTTP message signatures, Ed25519) gives cryptographic, IP-independent agent identity.
Cloudflare edge verification is live (Claude, ChatGPT, Perplexity, Common Crawl bots registered
since Mar 2026). Monetization Gateway blog explicitly pairs Web Bot Auth with usage-based pricing
for revenue-share attribution.

**Caveats:**

- Still an Internet-Draft — spec may evolve.
- Not every agent signs requests today; unsigned buyers pay but attribution is weaker.
- Fallback for non-agent buyers: Stripe metered API keys (per issue re-evaluate trigger).

---

## Unit economics (PRICING-PHILOSOPHY Principle 7: ≥50% gross margin)

Reproducible model: `apps/web/lib/x402-spike/unit-economics.ts`.

| Cost component | Default assumption | Per-call USD |
| --- | --- | --- |
| Facilitator settlement (Base/CDP) | $0 at spike time | $0 |
| On-chain gas (Base) | Sub-cent | ~$0.0001 |
| CDP metering (>1,000 tx/mo) | $0.001/tx | $0.001 |
| Off-ramp (batched USDC→fiat) | 0.75% mid estimate | price × 0.75% |

**Fixed rail cost (metered):** ~**$0.0011**/call above CDP free tier.

**Minimum viable price** clearing 50% margin at default rails: ~**$0.0023**.

**Recommendation: price artist resources at ≥$0.01 floor** — rails consume ~12.5% of gross,
clearing the margin gate ~4×. At $0.01, gross margin ≈ 87%.

```bash
pnpm --filter web exec vitest run apps/web/lib/x402-spike/unit-economics.test.ts
```

---

## Pilot architecture (self-hosted template)

```
Agent / MCP client
       │
       ▼
┌──────────────────────────────────────┐
│  x402-proxy Worker (edge)            │
│  PROTECTED_PATTERNS → per-route $   │
│  402 → verify/settle → JWT cookie   │
└──────────────┬───────────────────────┘
               ▼
┌──────────────────────────────────────┐
│  Origin: staging.jov.ie              │
│  /drop/[token]/assets/*  (press kit) │
│  /api/mcp/artist/*       (#11034)    │
└──────────────────────────────────────┘
```

Deploy path (human-required):

1. Fork [x402-proxy-template](https://github.com/cloudflare/templates/tree/main/x402-proxy-template).
2. Copy Jovie `PROTECTED_PATTERNS` from `workers/x402-artist-resource-proxy/wrangler.example.jsonc`.
3. Set `PAY_TO`, `JWT_SECRET` (secret), `NETWORK=base-sepolia` for pilot.
4. `npm run test:client` with funded test wallet.
5. Promote to `base` mainnet after finance signs off on treasury wallet.

---

## Pay Per Crawl vs x402 Worker vs Monetization Gateway

| Dimension | Pay Per Crawl | x402-proxy template | Monetization Gateway |
| --- | --- | --- | --- |
| Availability | Closed beta | Deploy today | Waitlist |
| Pricing granularity | One price / zone | Per-route patterns | Rules API (verb, dynamic, pay-on-success) |
| Merchant of Record | Cloudflare | Self (wallet) | Cloudflare (planned) |
| Best for Jovie P2 | Site-wide crawl monetization | **Artist resource pilot** | Production scale after waitlist |

---

## Decision triggers (systems, not events)

| Trigger | Action |
| --- | --- |
| Human provisions Cloudflare + Base wallet | **Ship self-hosted pilot** — pricing capability proven; no further protocol gate |
| Monetization Gateway waitlist lands + off-ramp confirmed + ≥1 artist opts in | **Build managed Gateway lane** |
| Measured latency >2 s on real agent clients | Re-evaluate; may need edge region tuning |
| Rail overhead >50% at our price floor | Raise floor or batch settlements |
| Web Bot Auth attribution too sparse for revenue-share | Fall back to Stripe metered API keys for non-agent buyers |

---

## Blockers (human/finance — cannot resolve autonomously)

| Blocker | Owner |
| --- | --- |
| Cloudflare account + Worker deploy access | Infra / human |
| Base wallet + USDC treasury/tax policy | Finance |
| CDP facilitator API key (if not using public facilitator) | Infra |
| Monetization Gateway waitlist signup | #product |
| Live e2e proof (`npm run test:client`) | Requires funded wallet above |

**UNVERIFIED:** managed Gateway take-rate; whether Cloudflare runs its own facilitator vs defaulting to CDP.

---

## Follow-ups

| Item | Classification |
| --- | --- |
| Human: provision Cloudflare + Base Sepolia wallet; run `test:client` | Required |
| Human: Monetization Gateway waitlist (#product) | Required |
| Finance: USDC treasury + off-ramp policy | Required |
| Build: on-chain receipt ledger (tx hash, resource, attribution) | Candidate |
| Build: Stripe metered fallback for non-Web-Bot-Auth buyers | Candidate |
| #11034: wire per-artist MCP tools behind x402-protected routes | Blocked on pilot deploy |

---

## Method note

- **No production payment path changed.** Spike is research + reproducible economics + reference config.
- Evidence from Cloudflare public docs/templates, x402.org spec, and Jovie `PRICING-PHILOSOPHY.md`.
- gbrain decision page: `decisions/x402-payment-gated-artist-resources`.