# x402 Payment-Gated Artist Resources Spike (GitHub #12750)

Prove the x402 402 → pay → retry loop on one Jovie artist resource using
Cloudflare's published **x402 Payment-Gated Proxy** Worker template, before
Monetization Gateway GA. Strategy document + runnable harness — no production
payment routing ships from this issue.

> **gbrain note:** query returned no prior-art pages during this spike (Air
> migration noise). Grounding is Cloudflare public docs + in-repo MCP/press-kit
> surfaces + structural cost/latency models.

## TL;DR: Go / No-Go

**Conditional GO** on x402-priced **per-artist MCP tools** and **press-kit share
drops** as the Monetization Gateway P2 lane.

One-line rationale: the open x402-proxy template supports **per-route pricing**
on existing Jovie surfaces (`/api/mcp/[username]`, `/drop/[token]`) with
sub-cent rail cost and ~665ms–2.2s first-request latency (structural estimate);
live E2E is **blocked** on Cloudflare deploy + funded test wallet, and production
rules/settlement UX waits on **Monetization Gateway waitlist** (human #product).

| Surface | Verdict |
| --- | --- |
| **Per-artist MCP (`/api/mcp/*`)** | **Adopt x402-proxy spike path** — aligns with #11034 agent commerce |
| **Press-kit drops (`/drop/*`)** | **Adopt** at higher per-access price ($0.05 suggested) |
| **Pay Per Crawl (zone pricing)** | **Complement, not substitute** — crawler bulk, not per-tool |
| **Monetization Gateway rules API** | **Wait for waitlist** — replaces DIY Worker at GA |

## Prior-art gate

| Category | Candidates | Verdict |
| --- | --- | --- |
| HTTP micropayment gating | Cloudflare x402-proxy template; Monetization Gateway (waitlist); DIY 402 middleware | **Wrap** x402-proxy now; **adopt** Gateway when waitlist clears |
| Per-tool MCP billing | `paidTool` + `withX402` (Agents SDK); x402-proxy in front of existing Next route | **Wrap** proxy first (no MCP server rewrite); **adopt** `paidTool` if MCP moves to Worker |
| Crawler zone monetization | Pay Per Crawl | **Adopt (CF-native)** for training/search crawlers — different granularity |
| Artist settlement | USDC on Base → CDP/fiat off-ramp | **Adopt** at Gateway GA; spike uses testnet only |

**In-repo facts (verified):**

- Per-artist MCP server exists: `apps/web/app/api/mcp/[username]/route.ts` (#11034).
- Press-kit share drops exist: `library_share_drops`, public `/drop/[token]`.
- No x402 or Monetization Gateway wiring exists in app code today.

## Pinned test asset

Canonical source: `apps/web/lib/x402-spike/test-asset.ts` + `scripts/x402-spike/test-asset.json`.

| Asset | Origin path | Protected pattern | Suggested price |
| --- | --- | --- | --- |
| **Primary:** MCP (lunawaves demo) | `/api/mcp/lunawaves` | `/api/mcp/lunawaves/*` | $0.01 |
| **Secondary:** Press-kit drop | `/drop/{token}` | `/drop/*` | $0.05 |

Deploy recipe: fork
[cloudflare/templates/x402-proxy-template](https://github.com/cloudflare/templates/tree/main/x402-proxy-template),
set `ORIGIN_URL` to `https://staging.jov.ie`, merge vars from
`scripts/x402-spike/wrangler.jovie.example.jsonc`.

Run structural spike locally:

```bash
pnpm tsx scripts/x402-spike/run-spike.ts
pnpm tsx scripts/x402-spike/run-spike.ts --check-keys
pnpm --filter web exec vitest run apps/web/tests/unit/lib/x402-spike.test.ts
pnpm --filter web exec vitest run scripts/x402-spike/spike.test.mjs
```

## Questions answered

### 1. Does 402 → pay → retry work with current agent clients? Latency?

**Structural: yes.** Cloudflare documents the loop for HTTP and MCP:

1. Client requests resource → `402 Payment Required` + `PAYMENT-REQUIRED` header.
2. Client signs payment (wallet) → retries with `PAYMENT-SIGNATURE`.
3. Facilitator verifies/settles → server returns resource + optional JWT cookie (1h).

Agent clients: `@x402/fetch`, `agents/x402` `withX402Client`, OpenCode plugin, Claude
Code hook ([CF x402 docs](https://developers.cloudflare.com/agents/tools/payments/x402/)).

**Live E2E: BLOCKED** — requires `CLOUDFLARE_API_TOKEN`, `PAY_TO`, `X402_TEST_PRIVATE_KEY`,
and `npm run test:client` against deployed Worker (human steps).

**Latency (structural budget in `apps/web/lib/x402-spike/latency-budget.ts`):**

| Phase | p50 | p95 |
| --- | ---: | ---: |
| 402 response | 15ms | 40ms |
| Client sign | 200ms | 800ms |
| Facilitator verify+settle | 400ms | 1200ms |
| Retry + proxy | 50ms | 150ms |
| **First paid request total** | **~665ms** | **~2190ms** |
| Cookie-amortized retry | ~50ms | ~150ms |

CF Monetization Gateway blog targets sub-second settlement on mainnet; testnet may be slower.

### 2. Settlement: stablecoin → fiat; accounting?

| Step | What lands where |
| --- | --- |
| Payment | USDC (or test USDC) to seller `PAY_TO` wallet on Base / Base Sepolia |
| Verify/settle | Facilitator (`https://x402.org/facilitator`) — does not custody funds |
| Fiat | Seller redeems via CDP / exchange off-ramp (human onboarding, not in spike) |

**Accounting today (spike):** on-chain receipt only. No Jovie ledger row — would need
a follow-up webhook/cron to ingest `PAYMENT-RESPONSE` headers or wallet events into
`apps/web` earnings surfaces.

**At Monetization Gateway GA:** Cloudflare rules API + dashboard intended to own
metering/settlement UX; waitlist signup is human (#product).

### 3. Can pricing vary per resource (vs Pay Per Crawl one-price-per-zone)?

**Yes for x402-proxy.** `PROTECTED_PATTERNS` is an array of `{ pattern, price, description }`
entries — each route/wildcard can have a distinct USD price. Jovie spike config prices MCP
at $0.01 and press-kit at $0.05.

**Pay Per Crawl:** one price per crawl **zone** (site-wide crawler tariff), not per MCP tool
or per press-kit token. Use PPC for bulk AI crawler traffic; use x402-proxy/Gateway for
granular artist resources.

**Monetization Gateway (planned):** variable pricing + verb-based rules (GET vs POST) per
[CF announcement](https://blog.cloudflare.com/monetization-gateway/) (2026-07-01).

### 4. Web Bot Auth: paying-agent attribution?

**Partial today.**

- x402-proxy template supports `bot_score_threshold` + `except_detection_ids` (Bot
  Management Enterprise) to require payment only for bot-class traffic and exempt known
  crawlers ([wrangler example](https://github.com/cloudflare/templates/blob/main/x402-proxy-template/wrangler.jsonc)).
- Detection IDs identify **bot class** (e.g. ChatGPT-User, Claude-User), not the **paying
  wallet owner** or end-user principal.
- CF Monetization Gateway docs plan **Web Bot Auth** for verified agent identity +
  usage-based pricing against known accounts.

**Spike verdict:** sufficient for crawler/agent *class* attribution; **insufficient** for
fan-level or wallet-to-artist revenue attribution without Gateway rules + Jovie ledger ingest.

## Unit economics

Computed in `apps/web/lib/x402-spike/cost-model.ts` (unit-tested).

| Lane | Est. rail cost / tx | Min viable price | Artist net @ $0.01 | Artist net @ $0.05 |
| --- | ---: | ---: | ---: | ---: |
| x402-proxy Worker | ~$0.00065 | $0.01 | ~$0.00935 | ~$0.04935 |
| Pay Per Crawl zone | ~$0.01015 | $0.01 zone | N/A (zone) | N/A |
| Monetization Gateway | ~$0.00065 (est.) | $0.01 | TBD at GA | TBD at GA |

**Price floor rule:** do not price artist MCP reads below **$0.01** at low volume — rail
cost is small but sub-cent list prices leave no margin after facilitator + gas.

**Volume sketch (100 paid MCP calls/day @ $0.01):**

- Gross: ~$30/mo
- Rail: ~$0.20/mo
- Net: ~$29.80/mo (before fiat off-ramp fees)

Scaling is **O(paid requests)** not O(users). Cookie session (1h) amortizes rail cost for
agent sessions that burst multiple MCP calls.

## In-repo integration surface

| Primitive | Path | x402 spike reuse |
| --- | --- | --- |
| Per-artist MCP | `apps/web/app/api/mcp/[username]/route.ts` | Proxy-gate POST JSON-RPC |
| Press-kit drops | `/drop/[token]`, `library_share_drops` | Proxy-gate public asset surface |
| Earnings dashboard | `apps/web/app/api/dashboard/monetization-summary/route.ts` | Future: ingest x402 settlement events |

No schema migration in this spike. Production wiring needs a Linear follow-up for durable
payment receipt storage (fail-closed per `security.md`).

## Blockers

| Blocker | Owner | Status |
| --- | --- | --- |
| Cloudflare Worker deploy + route | Human / infra | **Not started** |
| `PAY_TO` + testnet USDC | Human (wallet) | **Not started** |
| `X402_TEST_PRIVATE_KEY` for test client | Human (gitignored) | **Not started** |
| Monetization Gateway waitlist | Human (#product) | **Open** — blocks GA rules API |
| On-chain → Jovie earnings ledger | Engineering follow-up | **Not in spike scope** |

## Live E2E procedure (human-in-loop)

1. Deploy x402-proxy-template with `scripts/x402-spike/wrangler.jovie.example.jsonc` vars.
2. Fund test wallet (Base Sepolia USDC via [Circle faucet](https://faucet.circle.com/)).
3. `PRIVATE_KEY=0x... npm run test:client` in template checkout — confirms 402→pay→retry.
4. Replay MCP smoke: POST `resources/list` JSON-RPC from `scripts/x402-spike/test-asset.json`
   through proxy with `@x402/fetch` wrapper.
5. Record p50/p95 latency + settlement tx hash; update scorecard below.

## Decision triggers (systems, not events)

- **Ship x402-proxy for artist MCP when:** Monetization Gateway waitlist still closed **and**
  live E2E passes on staging **and** human confirms fiat off-ramp path for artist payouts.
- **Re-evaluate when:** Gateway GA opens (prefer rules API over DIY Worker); or monthly paid
  MCP volume exceeds **50,000** calls (≈ $500 gross @ $0.01) without ledger ingest.
- **Then:** migrate `PROTECTED_PATTERNS` to Gateway rules; add settlement webhook + earnings
  row; if unit economics break below $0.01 floor, bundle MCP into session cookie or uptick to
  $0.05 minimum.

**Keep Pay Per Crawl** for site-wide AI crawler compensation — orthogonal lane.

## Follow-ups

| Item | Tracking |
| --- | --- |
| Live Worker E2E + latency capture | Blocked on CF deploy + wallet — reopen when creds land |
| Monetization Gateway waitlist signup | Human #product |
| x402 settlement → earnings ledger | Candidate Linear issue at implementation time |
| `paidTool` MCP Worker migration | Candidate if Next.js route latency unacceptable at edge |

## References

- GitHub #12750 (this spike), #11034 (per-artist MCP)
- [CF Worker templates — x402 Payment-Gated Proxy](https://developers.cloudflare.com/ai-crawl-control/reference/worker-templates/)
- [CF x402 docs](https://developers.cloudflare.com/agents/tools/payments/x402/)
- [Monetization Gateway announcement](https://blog.cloudflare.com/monetization-gateway/) (2026-07-01)
- `apps/web/lib/x402-spike/` — test asset, cost model, latency budget
- `scripts/x402-spike/` — JSON fixture, runner, example wrangler vars