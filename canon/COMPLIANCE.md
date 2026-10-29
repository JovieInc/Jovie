# Legal and Compliance Register

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md), [`FLEET.md`](./FLEET.md)
Last updated: 2026-10-28
Owner: summer (keeps it current). Human owner of last resort: Tim White.
Source: Tim White, 2026-10-28 ("I'm one person with limited cash; I can't afford a lawsuit")

This is a risk-reduction register, not legal advice. Rows marked **COUNSEL** need a
licensed lawyer before anyone relies on them. Summer never tells Tim a row is "legally
fine"; she reports evidence, gap and the cheapest next step. Evidence below was gathered
2026-10-28 from the repo tree and the live site; "unverified" means no evidence was found.

## How Summer uses this register

1. **Keep it current.** Re-check every row at least quarterly and on any trigger below. Change `State`, `Evidence date` and `Status`; never delete a row, mark it `retired`.
2. **Gate launches.** Before any new surface, outbound campaign, data source, integration, vendor or AI feature ships, Summer checks it against the rows it touches and records the result on the launch issue. A launch that needs a disclosure the register lists does not ship without it.
3. **Ship required disclosures.** Ordinary product/docs gaps become PRs; the rest become agent-ready Linear issues labelled `compliance`.
4. **Watch signals.** DMCA notices to `legal@jov.ie`, data-subject requests to `privacy@jov.ie`, provider ToS or policy changes (Google/YouTube, Spotify, Apple, Stripe, Anthropic, OpenAI, Resend), regulator or platform emails, chargeback or abuse spikes, press or social complaints naming Jovie, any sender-reputation or spam-complaint alert.
5. **Escalate to Tim once.** Anything needing a real lawyer is one founder-queue task: the risk in one sentence, the deadline, a recommended low-cost option (see "Low-cost counsel ladder"), and what Summer will do meanwhile. No certainty language.
6. **Do not** send outbound legal replies, file registrations, or sign anything as Tim. Those are outbound actions for Tim.

## Register

Columns: requirement, current state with evidence, gap, fix, owner. Status: `ok`, `partial`,
`gap`, `unverified`. Fix refs: PR = shipped with this change, ISSUE = tracked in Linear.

### Entity, policies and consent

| ID | Requirement | Current state (evidence) | Gap | Fix | Owner | Status |
|---|---|---|---|---|---|---|
| ENT-1 | A real legal entity named in terms, policy, DMCA page and email; registered agent and a mailing address | Entity string `Jovie Technology Inc.` renders on /legal/terms, /legal/privacy, /legal/dmca (live, 2026-10-28; source `apps/web/constants/app.ts`). No incorporation record, registered-agent or mailing address found anywhere in repo or docs. | Cannot confirm the entity exists as named; no postal address published | Tim confirms entity and supplies a mailing address (CMRA or registered-agent address is acceptable; avoid a home address). Set `LEGAL_MAILING_ADDRESS`. **COUNSEL** to confirm entity name. | summer | gap |
| PRIV-1 | Privacy policy present and accurate to what we collect | `/legal/privacy` live, 235 lines, covers account, Google/Spotify data, AI providers, retention, deletion, children under 13, Google/Spotify API disclosures. This change removes stale Clerk references (auth is Better Auth) and bumps the date. | Policy does not describe audience data: fan/subscriber emails and phone numbers captured on artist profiles, visitor analytics and the `jv_aid` / `jv_identified` cookies, SMS opt-ins, outreach to unclaimed artists. No GDPR or CCPA/CPRA sections (legal bases, rights, transfers, categories, no-sale/no-share statement, authorized agents). Sub-processor list unverified (Resend, Statsig, Sentry, Neon, Vercel, Stripe, Anthropic, Google AI) | Rewrite with the three gaps above; keep sub-processor list generated from `ops/registry/third-party-grants.jsonl`. **COUNSEL** for final text. | summer | partial |
| PRIV-2 | Terms of service present, enforceable form | `/legal/terms` live (Oct 2026); includes DMCA, AUP, JAMS arbitration with class waiver and 30-day opt-out. | Arbitration/class-waiver enforceability, governing law and consumer carve-outs not reviewed | **COUNSEL** review once, at the same time as PRIV-1 | summer | unverified |
| PRIV-3 | Terms and Privacy linked where users sign up | `AuthShell` links both. `/identity` page showed plain text with no links. | Fixed in this change (links added) | PR | summer | ok after PR |
| COOK-1 | Cookie and analytics consent where required (EEA/UK, some US states) | `/legal/cookies` live; `ConsentBanner`, `ga-consent-init.js`, and consent-gated GoogleAnalytics component exist. | Not verified that non-essential tracking (Statsig, GA, audience cookies) is blocked before consent for EEA/UK visitors, nor that the banner is shown by region | Playwright check with EU geo header; record result here | summer | unverified |

### Data rights, retention and breach

| ID | Requirement | Current state (evidence) | Gap | Fix | Owner | Status |
|---|---|---|---|---|---|---|
| DSR-1 | GDPR/UK GDPR/CCPA data-subject requests: access, export, deletion, opt-out, correction; 1 month (GDPR) / 45 days (CCPA) | In-product `/api/account/export`, `/api/account/delete`, settings data-privacy page; `privacy@jov.ie`; policy promises 30 days. | No intake log or SLA timer; no path for non-users (fans and unclaimed artists whose data we hold) other than email; no verified-request or authorized-agent procedure; role as controller vs processor for artist-collected audience data undocumented | Summer logs every request (date, type, due date, outcome) in gbrain `compliance/dsr-log`; ISSUE for processor/controller position. **COUNSEL** for DPA with artists | summer | partial |
| RET-1 | Retention and deletion match what the policy says | Policy: account data 30 days after deletion, analytics aggregated at 90 days, raw deleted at 12 months. `apps/web/app/api/cron/data-retention/route.ts` exists. | Not verified the cron enforces exactly those windows, or that backups and third-party processors honor deletion | ISSUE: add retention invariant test comparing cron windows to policy | summer | unverified |
| BRE-1 | Breach notification readiness (GDPR 72h to regulator; US state laws; CCPA; app-store and provider contracts) | `SECURITY.md` and ops docs have no breach-notification procedure. | No runbook, no contact list, no decision tree | Runbook below (skeleton); Tim reviews once. **COUNSEL** on first real incident, before any notice goes out | summer | partial |

### Email, SMS and outreach

| ID | Requirement | Current state (evidence) | Gap | Fix | Owner | Status |
|---|---|---|---|---|---|---|
| CAN-1 | CAN-SPAM: truthful sender, working opt-out honored within 10 business days, valid physical postal address in every commercial email | Opt-out: claim invite and follow-up have signed unsubscribe URLs plus `api/unsubscribe/claim-invites`; product update and release-day emails carry RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post` and one-click routes. Postal address: none in any template before this change. | Address missing. This change adds a footer that prints the entity and `LEGAL_MAILING_ADDRESS`; until Tim sets the variable, commercial email still lacks the address. | Tim supplies address (ENT-1). **Launch gate: no outbound campaign until the variable is set in production.** | summer | partial |
| CAN-2 | Sender identity and no deception: claim invites and follow-ups are signed "Tim" | Templates `claim-invite.ts`, `claim-invite-followup.ts` sign as Tim. | If an agent writes or sends these at scale, the first-person signature and "we created a profile for you" framing must be accurate; subject lines must not mislead | Summer reviews each campaign copy; keep sender and `From` honest; ISSUE to confirm human-reviewed | summer | unverified |
| CASL-1 | CASL (Canada), GDPR/PECR (EU/UK): cold outreach to artists needs consent or a valid exemption; identity, contact and unsubscribe in every message | Outreach targets artists identified from public music presence. No recipient-country gating found. | Canadian recipients require implied/express consent tests; EU/UK sole traders and individuals are treated as consumers | Gate by recipient country: suppress CA/EU/UK from cold claim-invite until counsel clears. **COUNSEL** | summer | gap |
| SMS-1 | TCPA / CTIA for any SMS: prior express written consent, STOP/HELP, quiet hours, consent records | `api/webhooks/sms` and `sms-access-request` routes exist. | Consent copy, consent record storage and STOP handling not verified | ISSUE: audit SMS consent flow before any SMS marketing. **COUNSEL** before a campaign | summer | unverified |

### Content, disclosures and IP

| ID | Requirement | Current state (evidence) | Gap | Fix | Owner | Status |
|---|---|---|---|---|---|---|
| FTC-1 | FTC Endorsement Guides: clear disclosure of material connections for sponsored or brand-deal content, affiliate links and testimonials; no fake or incentivized-undisclosed reviews | `TestimonialCard` component and marketing testimonials exist; brand-deal tooling exists internally. No in-product "sponsored/paid partnership" marker or testimonial-consent record found. | No disclosure primitive for sponsored items on profiles; testimonial provenance and permission not recorded | ISSUE: sponsored-content label component + testimonial consent ledger. Marketing rule: only real, consenting, approved people (see approved-people policy). | summer | gap |
| AI-1 | AI disclosure where users interact with AI (EU AI Act Art. 50, Colorado AI Act, CA bot-disclosure, FTC) | Privacy policy has an "Artificial Intelligence Features" section naming Anthropic and Google AI. No visible notice in the chat composer or insights UI that content is AI-generated. | No in-product notice; outbound AI-written messages not labelled | ISSUE: one-line "Jovie AI can make mistakes" notice under the composer and an "AI-generated" tag on insights (taste-reviewed copy). **COUNSEL** only if we send AI-written messages to third parties on a user's behalf | summer | gap |
| DMCA-1 | DMCA 512(c) safe harbor: designated agent registered with the US Copyright Office, published agent contact incl. postal address, notice/counter-notice process, repeat-infringer policy | `/legal/dmca` live with agent email, process, counter-notice, repeat-infringer language. | Registration with the Copyright Office (dmca.copyright.gov, about USD 6, renew every 3 years) **unverified**; no postal address on the page; no admin takedown tool or log verified | Tim or Summer-with-Tim registers the agent (outbound filing, needs ENT-1 address); ISSUE for takedown log | summer | gap |
| LIC-1 | Rights to display cover art, previews and metadata; provider display and caching rules | Profiles and release pages show artwork and metadata from Spotify/Apple/other DSPs and artist uploads; `preview-url` and `dsp` routes exist. Terms prohibit uploading infringing content and grant Jovie a hosting license. | Per-provider rules (Spotify Developer Terms attribution and no-caching of content, Apple MusicKit, YouTube) not audited against what we store; preview availability is a provider-policy risk | ISSUE: provider display-rules audit per integration, recorded in API-1 | summer | unverified |
| TM-1 | Trademark clearance and registration for Jovie and Ovie | No registration or clearance evidence in repo. | Unknown conflicts in software/music classes; no filing | Knockout search (USPTO TESS replacement, WIPO) by Summer; file an intent-to-use application for the core mark when cash allows. **COUNSEL** if a conflict appears | summer | gap |
| IP-1 | Contractor and founder IP assignment; open-source license compliance | Repo carries a LICENSE; no PIIA or assignment records referenced. Agents author most code. | Confirm founder IP is assigned to the entity; any human contractor signs an IP assignment before work starts; track AI-output ownership position and third-party license obligations (symphony is a fork of an upstream project) | Use a standard PIIA template (Atlas/Clerky) once; Summer blocks contractor onboarding without it. **COUNSEL** for founder assignment if not done at formation | summer | unverified |

### Third-party platform and API terms

| ID | Requirement | Current state (evidence) | Gap | Fix | Owner | Status |
|---|---|---|---|---|---|---|
| API-1 | Stay inside each provider's terms: Google/YouTube API Services, Spotify Developer Terms, Apple, Stripe (incl. Connect), Resend/AWS SES-style sending rules, Anthropic, OpenAI | Privacy policy carries Google API Services (Limited Use) and Spotify disclosures. Grants are tracked in `ops/registry/third-party-grants.jsonl`; credentials in `ops/registry/credentials.json`. | Known issue: an agent lane used a Claude consumer subscription for automation, which the consumer terms do not allow; fix in progress (move to API key under commercial terms; owner gem-lanes). YouTube API Services: required links to the YouTube Terms and Google Privacy Policy not verified. No per-provider ToS-change watch | Summer adds a ToS-change watch for the providers listed (quarterly diff and on notice), records review date per provider here; close the Claude lane issue and record evidence | summer | partial |
| API-2 | Payments and money movement (tips, Stripe Connect) | Stripe handles card data; routes `create-tip-intent`, `stripe-connect`, `tips`. | Money-transmission, tax reporting and refund/dispute terms for tips and payouts not reviewed | **COUNSEL** only if volume grows or flow changes; confirm Stripe Connect platform agreement is satisfied | summer | unverified |

### Other products

| ID | Requirement | Current state (evidence) | Gap | Fix | Owner | Status |
|---|---|---|---|---|---|---|
| LYB-1 | LogYourBody body, photo and DEXA data is sensitive health data (WA My Health My Data Act, CCPA sensitive PI, GDPR special category, App Store rules) | LYB repo ships legal docs (privacy, GDPR, CCPA, health disclosure). Private `lyb-knowledge` repo holds transcripts and medication-related material. | Consumer-health-data policy, explicit consent for photos and DEXA import, and "not medical advice" positioning not verified end to end; no medication advice may ship | ISSUE: LYB health-data consent and claims review. **COUNSEL** before launch pricing at USD 79 to 400 per month with coached check-ins | summer | unverified |
| PUB-1 | Public repositories contain no private data | See `docs/company/repo-publicity-audit-2026-09-27.md` and the 2026-10-28 private-data audit | Open items tracked in the audit report; guard workflow `JovieInc/ci/.github/workflows/private-data-guard.yml` | Consumers call it on every public repo | gem-ci-repair | partial |

## Breach notification skeleton (BRE-1)

1. **Detect and contain** (agents): rotate affected credentials, snapshot logs, stop the leak. Record UTC timestamps for detection, containment and awareness (the clocks start at awareness).
2. **Assess** (Summer): what data, whose, how many, which jurisdictions, encrypted or not, risk of harm. Write facts only.
3. **Escalate to Tim immediately** as one founder-queue task with the assessment and a recommended counsel option. Do not draft or send notices to users or regulators without Tim and counsel.
4. **Clocks to put on the task**: EU/UK regulator within 72 hours of awareness where there is risk to individuals; US state laws vary (many 30 to 60 days; some require attorney general notice); health data (LYB) and payment data have their own rules; provider contracts (Stripe, Apple, Google) may require prompt notice.
5. **After**: root cause, a guard that prevents recurrence (lint, invariant or CI rule), and a register update.

## Low-cost counsel ladder (what Summer recommends to Tim, cheapest first)

1. Standard templates from the entity-formation provider (Atlas/Clerky) for PIIA and founder assignment.
2. A fixed-fee startup privacy/terms review (many firms quote USD 1,500 to 5,000 one-time); batch PRIV-1, PRIV-2, CASL-1 and AI-1 into one engagement.
3. Pay-per-question counsel or a legal plan for single issues (trademark filing, takedown dispute).
4. Cyber and E&O insurance quote (often includes a breach-response hotline) before the first paying enterprise customer.

Prices are rough planning ranges; Summer confirms current quotes before recommending a spend.

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-10-28 | Created the register; Clerk references removed from the privacy and cookie policies; postal-address email footer and `/identity` legal links added. | Tim White |
