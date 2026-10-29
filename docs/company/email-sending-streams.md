# Email sending streams

Decision date 2026-10-29. Canonical copy: gbrain `decisions/company/email-sending-streams-2026-10-29`.
Code: `apps/web/lib/email/streams.ts`. Guard: `apps/web/tests/unit/lib/email/streams-guard.test.ts`.

## Rule

Every outbound email belongs to one stream. Cold outreach never uses `jov.ie` or any subdomain of it. `jov.ie` carries Google Workspace mail and the transactional subdomain, so a burned reputation there costs sign-in codes and receipts.

| Stream | Audience | Provider | Domain (now, env default) | Domain (target) | Sender |
|---|---|---|---|---|---|
| transactional | users, receipts, OTP, dunning | Resend | `send.jov.ie` | `send.jov.ie` | `notifications@` |
| lifecycle | opted-in changelog and product updates | Resend | `send.jov.ie` (shares) | `notify.jov.ie` | `updates@` |
| founder | 1:1 plain text to existing users | Resend | `send.jov.ie` (shares) | `notify.jov.ie`; later Tim's Workspace mailbox | `tim@` |
| cold | artists who are not users | Instantly or Smartlead on Workspace inboxes | none (closed) | separate lookalike, not `jov.ie` | person names |
| auth email | Clerk-sent sign-in mail | Clerk | `clkmail.jov.ie` | unchanged | Clerk |
| human mail | team | Google Workspace | `jov.ie` apex | unchanged | people |

Moving a stream is an env change: `EMAIL_STREAM_{TRANSACTIONAL,LIFECYCLE,FOUNDER,COLD}_DOMAIN`. Defaults keep today's behaviour. Switch lifecycle and founder to `notify.jov.ie` only after `notify.jov.ie` shows Verified in Resend (DNS records already exist; the Resend dashboard was not reachable by tooling, and the API key is send-only).

## Provider verdicts

- Resend: forbids unsolicited and cold email (AUP), complaint rate under 0.08%, bounce under 4%. Fine for the first three streams. Never cold.
- Cloudflare Email Service: public beta, Workers Paid ($5/mo), 3,000 sends/mo included then $0.35 per 1,000, arbitrary recipients after the sending domain is onboarded, new accounts start on a conservative daily quota. Its FAQ says it supports transactional email only. Verdict: not cold, not lifecycle or founder. Possible transactional second provider later; not worth moving now.
- Gmail and Yahoo bulk-sender rules, and cold-email practice, point the same way: separate lookalike domains, warmed mailboxes, low volume per inbox.

## Spend items (Ovie decision cards for Summer to file)

Prices are last-known list prices; verify at checkout. Spend cards need a Summer spend-preflight receipt (`preflightReceiptId`) before filing.

```json
[
  {
    "idempotencyKey": "email-cold-domain-20261029",
    "kind": "decision",
    "product": "jov",
    "title": "Use meetjovie.com as the cold outreach domain",
    "body": "Cold outreach must not use jov.ie. We already own meetjovie.com (Vercel, expires 2026-12-25, renewal about $15/yr). It has Google MX and DMARC p=reject today, so first confirm no human mailbox depends on it. No new cost now; renewal is due in 58 days. Alternatives: jovie.app or jovie.dev (owned, no mail DNS).",
    "recommendation": "Approve meetjovie.com as the sacrificial cold domain after confirming it holds no human mail.",
    "defaultIfSilent": "Approve meetjovie.com; no purchase.",
    "amountUsd": 0,
    "defaultDecision": "approve"
  },
  {
    "idempotencyKey": "email-cold-workspace-seats-20261029",
    "kind": "spend",
    "product": "jov",
    "title": "3 Google Workspace seats for cold inboxes",
    "body": "Three Business Starter seats on the cold domain, 15 to 20 cold sends per inbox per day (about 1,300 a month), warmed 2 to 3 weeks before the first send. About $7 to $8.40 per seat per month, $21 to $25 a month total.",
    "recommendation": "Approve 3 seats; add more only if reply data justifies it.",
    "amountUsd": 25,
    "defaultDecision": "reject"
  },
  {
    "idempotencyKey": "email-cold-tool-20261029",
    "kind": "spend",
    "product": "jov",
    "title": "Instantly Growth plan for cold sending",
    "body": "The existing Instantly workspace returns 402 (no active paid plan), so nothing can send. Growth is about $37 per month billed annually or $47 monthly; Smartlead Basic is about $39. Both permit cold outreach. First real send stays behind the Ovie outbound approval card and CAN-SPAM address (JOV-9648).",
    "recommendation": "Approve Instantly Growth, monthly billing, cancel if no approved send within 60 days.",
    "amountUsd": 47,
    "defaultDecision": "reject"
  },
  {
    "idempotencyKey": "email-dmarc-monitor-20261029",
    "kind": "decision",
    "product": "jov",
    "title": "Free DMARC report parser",
    "body": "DMARC reports go to dmarc-reports@jov.ie and land in Tim's inbox as unread XML (2 in the last 60 days). A free tier parser (Postmark DMARC digests or dmarcian) would give weekly readable summaries. Needs an account signup and a rua change on the apex, which stays untouched until Tim approves.",
    "recommendation": "Approve a free-tier parser; Tim or Summer signs up, then rua is updated.",
    "amountUsd": 0,
    "defaultDecision": "reject"
  },
  {
    "idempotencyKey": "email-cloudflare-workers-paid-20261029",
    "kind": "spend",
    "product": "jov",
    "title": "Cloudflare Workers Paid for Email Service",
    "body": "Only needed to send through Cloudflare Email Service ($5/mo, transactional only). Resend already covers transactional.",
    "recommendation": "Reject. Revisit if Resend costs or deliverability become a problem.",
    "amountUsd": 5,
    "defaultDecision": "reject"
  }
]
```

## Measurement

`GET /api/internal/ovie/email-deliverability` (Summer OIDC) returns delivered, bounced, complained and rates per sending domain and stream over 7 days, flags breaches against stream thresholds, and lists hard violations and separation gaps. Source: Resend webhook outcomes (`senderDomain` is now stored on each event). Rates are not judged below 50 outcomes.

## Sources

- Resend Acceptable Use Policy: https://resend.com/legal/acceptable-use
- Cloudflare Email Service FAQ, limits, pricing: https://developers.cloudflare.com/email-service/reference/faq/ , https://developers.cloudflare.com/email-service/platform/limits/ , https://developers.cloudflare.com/email-service/platform/pricing/
- Cold email infrastructure guides (secondary, volume ranges disagree): https://www.scaledmail.com/blogs/cold-email-infrastructure-guide , https://leadsmonky.com/google-workspace-for-cold-outreach/
- `jovie research` was unavailable (MCP connection closed, JOV-9770); web search used instead.
