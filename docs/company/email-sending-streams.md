# Email sending streams

Tim, 2026-10-29: "Protect sending and reputation. All agents must have clear,
safe paths to send and properly route things. We can't let agents go rogue and
email cold outbound or something over our transactional path."

Decision: gbrain `decisions/company/email-sending-streams-2026-10-29`.
Registry (the one source of truth): `apps/web/lib/email/stream-registry.json`.
Gateway: `apps/web/lib/email/gateway` (`sendStreamEmail`).
Guard: `node scripts/external-api-guard.mjs` (mail rules in `scripts/lib/mail-send-guard.mjs`).
Contract tests: `apps/web/tests/unit/lib/email/gateway.contract.test.ts`.

## Rule

Every email goes through the send gateway and declares a stream, a purpose and
the recipient's consent basis. The registry binds the stream to its provider,
sending domain and address, reply-to, required headers, postal footer,
consent bases, suppression scope, hourly limit, approval and deliverability
thresholds. Callers pass a display name at most; they never choose a provider
or an address.

Cold outreach never uses `jov.ie`, any subdomain of it, or the Resend
transactional account. Until Tim approves a cold path (domain, provider and
spend cards), the gateway rejects `cold` with `stream-closed`.

## Streams

Values below are the registry's as of this doc; the registry wins.

| Stream | What | Provider | From | Consent bases | Headers / footer | Suppression | Limit/h | Approval | Pauses |
|---|---|---|---|---|---|---|---|---|---|
| transactional | sign-in codes, receipts, dunning, verification, release emails to opted-in fans, artist-requested partner submissions | Resend | `notifications@send.jov.ie` | auth-request, account-transaction, opt-in, artist-request | none | delivery (hard bounce, invalid, abuse, legal) | 5000 | none | never (incident only) |
| lifecycle | onboarding and signup recovery to our users | Resend | `tim@send.jov.ie` (target `notify.jov.ie`) | account-relationship | List-Unsubscribe + one-click, postal address | all | 100 | Ovie outbound card | yes |
| founder | 1:1 mail from Tim to existing relationships | Resend | `tim@send.jov.ie` (target `notify.jov.ie`) | existing-relationship | none | all | 50 | none | yes |
| broadcast | newsletters, changelog, weekly recaps to opted-in lists | Resend | `updates@send.jov.ie` (target `notify.jov.ie`) | opt-in | List-Unsubscribe + one-click, postal address | all | 2000 | Ovie outbound card | yes |
| inbox | routing replies from an artist's Jovie inbox | Resend | `<artist>@jovie.fm` | inbound-reply | none | delivery | 200 | none | yes |
| cold | prospects, claim invites, follow-ups | none (closed) | none (never `jov.ie`) | legitimate-interest | List-Unsubscribe + one-click, postal address | all | 0 | Ovie outbound card | yes |

Outside the gateway: Clerk sends its own auth mail from `clkmail.jov.ie`;
people send from Google Workspace on the `jov.ie` apex.

A stream moves to a new domain with an env change after the domain shows
Verified at the provider: `EMAIL_STREAM_{TRANSACTIONAL,LIFECYCLE,FOUNDER,BROADCAST,INBOX,COLD}_DOMAIN`.

## What the gateway checks, in order

1. Stream is registered and open; cold is never on the core domain.
2. The stream's provider permits it (Resend never carries cold).
3. Consent basis is present and allowed for the stream.
4. Sender: the registry's address; a display name or local part only where
   the registry allows it.
5. Required headers (`List-Unsubscribe`, `List-Unsubscribe-Post`) are present.
6. Postal address: `LEGAL_MAILING_ADDRESS` set (CAN-SPAM, JOV-9648), appended
   when the body lacks it. Unset fails closed.
7. Approval: an approved Ovie `outbound` card (`approval.cardId`).
8. Not paused by the deliverability loop (transactional never pauses).
9. Recipient not suppressed (scope per stream).
10. Under the stream's hourly limit (Redis sliding window).

Every decision logs one `email_gateway_send` line (stream, purpose, outcome,
code, ms) and every send carries Resend tags `stream` and `purpose`.

## Enforcement in CI

`node scripts/external-api-guard.mjs` (Source Validation and
`pnpm preflight:changed`) fails outside `apps/web/lib/email/gateway/` on:

- `mail-sdk`: importing `resend`, nodemailer, SendGrid, Postmark, Mailgun, SES,
  Brevo, Mandrill, MailerSend, Loops, emailjs; `new Resend(`; Python `smtplib`.
- `mail-host`: a URL for a mail provider API (`api.resend.com`, `api.instantly.ai`, ...).
- `smtp`: `smtp://` URLs, `smtp.<host>` literals, `createTransport(`, `smtplib.SMTP(`.
- `hardcoded-from`: a literal sender address (`from: 'x@y'`, `fromEmail = 'x@y'`).
- `send-without-stream`: `sendEmail` / `sendStreamEmail` without `stream`, or
  an email `sendNotification` without `emailRoute`.
- Registry invariants: cold never on `jov.ie` or Resend; lifecycle, broadcast
  and cold keep one-click unsubscribe and the postal address.

Sites that existed when the guard landed are grandfathered in
`scripts/lib/mail-send-guard.ratchet.gen.json`, which only shrinks.

TypeScript enforces the same contract: `EmailMessage`, `sendEmail` options and
`sendStreamEmail` requests require `stream`, `purpose` and `consent`.

## Agents and Summer

No agent, chat tool or MCP tool can send email directly. `fan_email_send`
queues for human approval and has no executor; the Gmail connector is
read-only (`no-gmail-send.test.ts`); Summer's iMessage and Telegram channels
message Tim only. Any new agent send path calls `sendStreamEmail` and is held
to the same stream rules and Ovie card approvals.

## Deliverability loop

- Source: Resend webhooks (`/api/webhooks/resend`) write each delivered,
  bounced and complained outcome to `notification_delivery_log` with `stream`
  (the gateway tag) and `senderDomain`. Opens and clicks are excluded.
- Rates per stream and per domain over 7 days; not judged under 50 outcomes.
- Lines: warn above 0.08% complaints (Resend AUP) or 2% bounces; pause above
  0.1% complaints (0.3% for transactional and inbox, the Gmail/Yahoo hard line)
  or 4% bounces.
- Event-driven: every bounce or complaint webhook re-judges its stream. Over
  the warn line Summer gets an incident card. Over the pause line a pausable
  stream stops (`email-stream-pause:<stream>` in the Ovie operating KV) and
  Summer gets a card; approving it resumes the stream. Silence never resumes.
- Summer reads `GET /api/internal/ovie/email-deliverability` (Summer OIDC).

### DMARC aggregate reports

`rua=mailto:dmarc-reports@jov.ie` lands in Tim's Gmail and nothing parses it.
Cheapest ingestion: add a free Postmark DMARC digest address as a second
`rua` (no code, $0, weekly readable digest), then later parse reports in-house
through the existing Resend inbound webhook if the digest is not enough.
After 7 consecutive days of clean reports, move `_dmarc.send.jov.ie` from
`p=none` to `p=quarantine` (Summer task, earliest 2026-11-05). Note: PR #23153
found three `v=DMARC1` records at `_dmarc.jov.ie`; receivers discard all of
them, so the apex has no effective policy until two are removed.

### Google Postmaster Tools

Needs a DNS TXT verification on `jov.ie` from Tim's Google account, then
Summer reads domain reputation and spam rate weekly.

### Resend Forge

Forge moves sending onto Resend's shared pool, adds one DNS record and falls
back to the current engine automatically; Resend must consider us an
established good sender first. Summer checks eligibility weekly on the Resend
domain page and posts the observation to `POST /api/internal/ovie/email-deliverability`.
When Resend says eligible and every live stream has 500+ deliveries under 2%
bounces and 0.1% complaints, that call files one one-tap Ovie card to Tim with
the DNS record. Nothing activates Forge automatically.

## Spend and decisions pending Tim

Cold domain (`meetjovie.com`, owned), Workspace seats for cold inboxes, the
Instantly plan, and the free DMARC digest are Ovie cards; see the gbrain
decision for amounts.

## Sources

- Resend Acceptable Use Policy: https://resend.com/legal/acceptable-use
- Gmail sender guidelines: https://support.google.com/a/answer/81126
- RFC 8058 one-click unsubscribe: https://www.rfc-editor.org/rfc/rfc8058
