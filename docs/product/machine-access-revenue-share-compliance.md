# Machine-access revenue share — consent, terms & payout compliance

> **JOV-3831** (needs-decision child of GitHub [#12749](https://github.com/JovieInc/Jovie/issues/12749) P1).  
> Decision package for artist AI-access revenue share before P1 ships.  
> Evidence captured 2026-07-31. **Final calls are Tim’s** — proposed defaults below are agent-drafted and marked for sign-off.

**gbrain slug (when sync available):** `decisions/machine-access-revenue-share-compliance`

**Code source of truth for numeric/policy knobs:**  
`apps/web/lib/monetization/machine-access-payout-policy.ts`

---

## Status

| Item | State |
| --- | --- |
| Decision set drafted | **Yes** — this document |
| Tim sign-off | **Pending** (issue labeled needs-decision) |
| Consent / ToS copy drafted | **Yes** — §5 + copy module |
| Consent copy approved by Tim | **Pending** |
| Tax reporting path documented | **Yes** — §6 |
| Payout policy documented | **Yes** — §4 |
| Pay Per Crawl beta agreement reviewed | **Partial** — public docs only; full beta agreement **UNVERIFIED** until zone access lands (§7) |
| Unblocks P1 (#12749) build | **When Tim signs §3** |

---

## 1. Problem

Paying artists a share of machine-access revenue (Cloudflare Pay Per Crawl → zone owner → per-artist attribution ledger → Stripe Connect) creates **consent**, **tax**, and **terms** obligations that must be settled before the P1 attribution/payout build ships.

Parent product path (already sequenced):

1. **P0 shipped** — AI crawler intelligence (#12747).
2. **P1 gated** — per-artist attribution ledger + Connect payouts (#12749).
3. **P2** — x402 / Monetization Gateway resource pricing ([spike](../spikes/x402-payment-gated-artist-resources.md)).

---

## 2. Money flow (canonical)

```text
AI crawler ──(pay intent headers)──► Cloudflare edge (zone: jov.ie)
                                         │
                                         │ MoR: charge crawler, aggregate
                                         ▼
                              Cloudflare → Jovie platform
                              (dedicated PPC Stripe Connect; monthly)
                                         │
                                         │ attribution ledger (per artist path)
                                         ▼
                              Jovie → artist (Stripe Connect Express transfer)
                              fiat only; monthly; $10 floor
```

**Rules:**

- Cloudflare is **Merchant of Record** for crawler charges and pays the **zone owner** (Jovie), not individual artists.
- Per-artist share is a **downstream commercial obligation of Jovie** (platform → creator), analogous to the merch payout ledger — not a Cloudflare sub-merchant relationship.
- Artists never touch crypto or Cloudflare billing for P1.

---

## 3. Decision set (proposed — Tim sign-off required)

Mark each row **Approved / Rejected / Revised** in Linear when Tim decides. Do not ship P1 until all four are signed.

| ID | Decision | Proposed default | Owner | Status |
| --- | --- | --- | --- | --- |
| **D1** | Revenue-share split | **Artist 70% / Platform 30%** of net machine-access revenue attributed to that artist after Cloudflare MoR fees and any payment-rail costs. “Artist-majority” preserved; exact % is Tim’s call. | Tim | **Pending** |
| **D2** | Opt-in model | Charging AI crawlers against an artist’s pages requires **explicit artist opt-in**. **Default OFF.** Clear copy that some AI services may then not access (or fully index) their content when they refuse to pay. | Tim | **Pending** |
| **D3** | Payout floor + cadence | **Monthly** payout run; **$10.00 USD minimum** accrued balance; unpaid remainder rolls forward. Payouts only via **Stripe Connect Express** with `payoutsEnabled`. | Tim | **Pending** |
| **D4** | Stablecoin / x402 (P2) | Platform **redeems USDC (or other stablecoin) to fiat** in treasury; artists are **always paid fiat** via Connect. No artist crypto wallets, gas, or tax-of-crypto handling in product. | Tim | **Pending** |

### Decision triggers (systems, not events)

| Trigger | Action |
| --- | --- |
| Tim signs D1–D4 | Remove needs-decision; #12749 may implement against `machine-access-payout-policy.ts` |
| PPC beta agreement access lands | Re-run §7 verification; open follow-up if redistribution restricted |
| First US artist year ≥ $600 machine-access payouts | Confirm Stripe Connect 1099 product filing path live for tax year |
| Measured artist opt-in rate &lt; 5% after 30 days of GA offer | Re-evaluate copy + default framing (not the default-OFF rule itself) |
| Platform margin on net rev-share after rails &lt; 50% of platform cut | Raise zone price or revisit D1 split (PRICING-PHILOSOPHY Principle 7) |

---

## 4. Payout policy (operational)

Canonical constants: `apps/web/lib/monetization/machine-access-payout-policy.ts`.

| Policy | Value |
| --- | --- |
| Currency artists receive | **USD fiat** via Stripe Connect Express |
| Cadence | Calendar-month close; transfer batch in first 10 business days of following month |
| Minimum transfer | **$10.00** accrued and unpaid |
| Below floor | Balance rolls; no partial fee |
| Eligibility | Artist opted in (D2), Connect `payoutsEnabled`, identity/tax profile complete per Stripe |
| Accrual basis | Attributed crawl charge events after MoR settlement, multiplied by artist share (D1) |
| Disputes | Ledger is append-only; reverse via compensating ledger entries only |
| Chargebacks / MoR adjustments | Cloudflare adjustments reduce platform pool first; already-paid artists are not clawed back in-product without legal review |
| Plan gate | Pro+ (matches FEATURE_REGISTRY planned monetization row) |

### What is *not* in scope for P1

- Per-path or per-crawler pricing (zone has one PPC price; policy engine allow/charge/block is product layer).
- Paying artists in crypto or stablecoin.
- Automatic Cloudflare → artist multi-party split (not supported; we own downstream share).

---

## 5. Consent & ToS language (draft for Tim + legal)

**Do not paste into production ToS until Tim approves.** After approval, legal integrates into `apps/web/content/legal/terms.md` and the settings opt-in surface uses the short-form copy module.

### 5.1 Settings toggle — short form (UI)

**Title:** Share AI Access Revenue  

**Description:**  
Optional opt-in (off by default). When on, Jovie may charge approved AI crawlers for automated access to your public profile and related pages, and share a majority of the net proceeds with you. Some AI services may reduce or stop accessing your content if they do not pay. You can turn this off anytime. Payouts are monthly in USD via Stripe Connect once your balance reaches $10.

**Confirm dialog (opt-in):**  
By turning this on, you authorize Jovie to (1) apply machine-access charges to automated requests for your opted-in content, (2) attribute those charges to your profile, and (3) pay you your revenue share under Jovie’s Machine-Access Revenue Share terms. You understand that charging may reduce free AI crawler access to your content.

**Opt-out notice:**  
Turning this off stops new charging attribution for your pages. Accrued unpaid balance remains payable under the payout policy.

### 5.2 ToS section draft — Machine-Access Revenue Share

> **Machine-Access Revenue Share**  
>
> Jovie may participate in programs that charge automated agents and AI crawlers for access to content on the Jovie platform (including Cloudflare Pay Per Crawl or successor features). Cloudflare (or another designated merchant of record) may collect fees from crawlers and remit net amounts to Jovie as zone owner.
>
> **Opt-in required.** We will not attribute machine-access charges to your artist profile for revenue-share purposes unless you have explicitly opted in in your account settings. Opt-in is off by default. You may opt out at any time; opt-out applies prospectively.
>
> **Share of proceeds.** If you opt in, Jovie will attribute eligible net machine-access revenue associated with your public content using our attribution ledger and pay you the then-current artist share (displayed in product and changeable with notice). The platform retains the remainder. “Net” means amounts actually received by Jovie after merchant-of-record fees, refunds, chargebacks, currency conversion, and payment-processing costs.
>
> **Payouts.** Payouts are made in U.S. dollars (or another supported local currency via Stripe) to your connected Stripe Express account, on approximately a monthly cadence, subject to a minimum balance (currently $10 USD or equivalent) and successful completion of identity and tax onboarding. Balances below the minimum roll forward.
>
> **No guarantee of crawler access or revenue.** Opting in does not guarantee that any crawler will pay or crawl your content. Charging may cause some automated services to skip, partially fetch, or block access to your content. Jovie does not control third-party crawler behavior.
>
> **Taxes.** You are solely responsible for taxes on amounts paid to you. For U.S. taxpayers, Jovie (or Stripe on Jovie’s behalf) may issue information returns (e.g. Form 1099) as required by law. You agree to provide accurate tax information through Stripe Connect onboarding.
>
> **Stablecoin and agent payments (future).** If Jovie receives payment in stablecoins or other digital assets for automated access (including x402-style flows), Jovie may convert those assets to fiat at its discretion. Artist payouts under this program remain fiat payouts via Stripe Connect unless we expressly offer and you accept another settlement method.
>
> **Program changes.** We may modify share rates, floors, crawler policy maps, or suspend the program with reasonable notice when commercially practicable, except where immediate suspension is required for legal, security, or partner-agreement reasons.

### 5.3 Privacy note (one line for Privacy Policy when shipping)

> If you opt into Machine-Access Revenue Share, we process crawl charge and attribution data solely to operate the ledger, prevent fraud, and pay you.

---

## 6. Tax reporting path

**Disclaimer:** Operational plan for engineering and finance — not legal advice. Confirm with counsel/CPA before first tax year with material payouts.

### 6.1 Two distinct money events

| Event | Who pays whom | Tax character (working model) |
| --- | --- | --- |
| A. PPC settlement | Cloudflare MoR → **Jovie platform** | Platform **gross receipts** (Jovie books income) |
| B. Artist rev-share | **Jovie** → artist Connect account | Platform **expense** / payment to creator; may be reportable to artist |

Do **not** treat Cloudflare’s 1099/K (if any) to Jovie as satisfying artist reporting. Artist reporting follows **event B**.

### 6.2 United States artists

| Topic | Path |
| --- | --- |
| Account type | Stripe Connect **Express** (already used: `apps/web/app/api/stripe-connect/onboard/route.ts`) |
| Identity / TIN | Collected in Connect onboarding (SSN/EIN as Stripe requires) |
| Likely form for rev-share transfers | **Form 1099-NEC** (nonemployee compensation) when calendar-year payments ≥ **$600** to a U.S. payee — *confirm with CPA whether licensing/royalty treatment (1099-MISC) is more accurate; product still needs reporting either way* |
| When Stripe auto-issues 1099-K | Per [Stripe Connect tax reporting](https://docs.stripe.com/connect/tax-reporting): Stripe issues 1099-K when the connected account pays fees directly (`controller.fees.payer` = `account`, etc.). Express accounts where **the platform controls fees** typically **do not** get a Stripe-issued 1099-K for platform-priced transfers — **the platform remains responsible** for any required 1099. |
| Product to enable | Stripe Connect **1099 tax reporting** product for in-scope connected accounts; e-delivery via Express Dashboard |
| Threshold tracking | Ledger must store paid amounts per calendar year per artist for eligibility and audit |
| State | Some states have additional thresholds; finance owns multi-state review |

### 6.3 International artists

| Topic | Path |
| --- | --- |
| Onboarding | Stripe Connect collects W-8BEN / W-8BEN-E (or local equivalent) as required |
| U.S. 1099 | Generally **not** issued to non-U.S. persons for foreign-source services; confirm with CPA for U.S.-source characterization |
| Withholding | Default **no** automatic FATCA/chapter-3 withholding in product unless counsel requires; freeze payouts if Stripe flags missing tax docs |
| Local tax | Artist responsible for income tax in their jurisdiction; Jovie provides payout history export |
| VAT/GST on rev-share | Treat as B2B creator compensation; do not add sales tax on top of rev-share transfers unless local law requires (finance + counsel) |

### 6.4 Engineering requirements (for #12749)

1. Persist opt-in timestamp, version of consent copy accepted, and IP/user-agent audit fields.
2. Ledger columns: `gross_attributed_cents`, `artist_share_cents`, `platform_share_cents`, `currency`, `period`, `stripe_transfer_id`.
3. Year-to-date paid total per Connect account for tax threshold tooling.
4. No success toast that implies “tax free” or “we handle all your taxes.”

---

## 7. Pay Per Crawl beta — downstream revenue sharing

### 7.1 What public docs establish

Sources (public; not the private beta agreement):

- [What is Pay Per Crawl?](https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/) — closed beta; **Cloudflare is Merchant of Record**; price is **per zone**.
- [Manage payouts](https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/use-pay-per-crawl-as-site-owner/manage-payouts/) — zone owner connects a **dedicated** Stripe account via Cloudflare dashboard; Cloudflare aggregates charges and pays publishers **monthly**; minimum thresholds / settlement periods apply; balance may not be fully visible in dashboard during beta.
- [Introducing pay per crawl](https://blog.cloudflare.com/introducing-pay-per-crawl/) — site owners set allow / charge / block per crawler; flat domain-wide price.

### 7.2 Downstream share by the zone owner

| Question | Finding |
| --- | --- |
| Does Cloudflare pay multi-tenant creators on a shared zone? | **No.** Payouts go to the **zone owner’s** dedicated PPC Stripe connection. |
| May the zone owner redistribute received proceeds to artists? | **Public docs do not forbid it.** Downstream share is a separate contractual relationship (Jovie ↔ artist). Functionally identical to merch: platform receives commercial proceeds, pays creators from its own books. |
| Is artist Connect the same Stripe account as PPC? | **Must not be.** Cloudflare requires a **dedicated** PPC Stripe connection; artist Express accounts remain Jovie’s Connect platform accounts. |
| Does beta agreement explicitly permit or restrict redistribution? | **UNVERIFIED.** Private beta terms are not published. |

### 7.3 Gate when beta access lands

Human / legal checklist (cannot automate without agreement PDF):

1. Obtain Pay Per Crawl beta agreement and any Stripe Addendum.
2. Confirm no exclusivity clause that forbids sharing proceeds with content owners on the zone.
3. Confirm no ban on multi-tenant / marketplace use of a single zone price.
4. Confirm MoR / tax characterization of Cloudflare → Jovie payments.
5. Record outcome on this page + Linear JOV-3831 comment; open a **Required** follow-up issue if restricted.

**Working assumption for P1 design (fail closed if wrong):** redistribution is permitted as ordinary platform COGS / creator payables after Jovie receives MoR net proceeds. If beta terms prohibit marketplace-style redistribution, **stop P1 payouts** and fall back to intelligence-only (P0) until terms or architecture change (e.g. per-artist zones — likely non-viable).

---

## 8. Alignment with P2 / x402

The [x402 spike](../spikes/x402-payment-gated-artist-resources.md) already recommends treasury off-ramp + fiat artist settlement. **D4** freezes that as product policy:

- On-chain receipt ledger is platform-internal.
- Artist-facing earnings UI shows **fiat** accrued/paid only.
- No Connect destination = crypto wallet.

Unit economics remain in `apps/web/lib/x402-spike/unit-economics.ts` (margin gate ≥50%).

---

## 9. Acceptance mapping (JOV-3831)

| Criterion | Where |
| --- | --- |
| Signed-off decision set recorded | This doc §3 + Linear issue comment when Tim signs; gbrain slug above when MCP available |
| Consent copy approved | §5 draft; Tim + legal approval required before ToS merge |
| Payout policy documented | §4 + `machine-access-payout-policy.ts` |
| Unblocks P1 | After Tim signs D1–D4 |

---

## 10. Related

| Artifact | Link |
| --- | --- |
| Linear | [JOV-3831](https://linear.app/jovie/issue/JOV-3831) |
| P1 epic | [GitHub #12749](https://github.com/JovieInc/Jovie/issues/12749) |
| P0 intelligence | FEATURE_REGISTRY — AI crawler intelligence |
| Policy code | `apps/web/lib/monetization/machine-access-payout-policy.ts` |
| Stripe Connect onboard | `apps/web/app/api/stripe-connect/onboard/route.ts` |
| Stripe tax docs | https://docs.stripe.com/connect/tax-reporting |
| Pricing canon | [`docs/company/PRICING-PHILOSOPHY.md`](../company/PRICING-PHILOSOPHY.md) |
